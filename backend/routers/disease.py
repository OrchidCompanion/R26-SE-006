import os
import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
import httpx
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "https://dinukarathnayake-orchid-inference.hf.space")
HF_TOKEN = os.getenv("HF_TOKEN")

DISEASE_CONFIDENCE_THRESHOLD = 0.6

NPK_THRESHOLDS = {
    "N": {"low": 25, "high": 65},
    "P": {"low": 15, "high": 35},
    "K": {"low": 50, "high": 130},
}

RECOMMENDATIONS = {
    "black_rot": {
        "label": "Black Rot",
        "disease_info": "Black Rot detected. Fungal infection on orchid tissue.",
        "treatment": [
            "Remove infected tissue with sterilized tools immediately",
            "Reduce excess moisture; improve air circulation",
            "If you have neem oil, apply it to the infected spots.",
            "Apply proper fungicide (copper octanoate, phosphorous acid, copper ammonium complex, — check label compatibility)",
            "Isolate infected plant to prevent spread",
        ],
    },
    "bacterial_brown_spot": {
        "label": "Bacterial Brown Spot",
        "disease_info": "Bacterial Brown Spot detected.",
        "treatment": [
            "Apply hydrogen peroxide to localized spots",
            "Remove infected tissue with a sterile blade (severe cases)",
            "Apply chemical treatment (Dithane M-45, Manzate, Captan 50 WP, or Captaf — per label instructions)",
            "Avoid copper-based products on Dendrobiums",
        ],
    },
    "healthy": {
        "label": "Healthy",
        "disease_info": "No disease detected. Leaf appears healthy.",
        "treatment": ["Continue current care routine"],
    },
    "invalid": {
        "label": "Invalid image",
        "disease_info": "The upload does not look like a valid orchid leaf.",
        "treatment": ["Retake a clear close-up of a single orchid leaf and try again"],
    },
}

ADVICE_MAP = {
    "N_low": "Apply nitrogen-rich fertilizer",
    "N_high": "Reduce nitrogen application",
    "P_low": "Apply phosphorus fertilizer",
    "P_high": "Reduce phosphorus application",
    "K_low": "Apply potassium fertilizer",
    "K_high": "Leach cocopeat with water",
    "N_ok": "Nitrogen OK",
    "P_ok": "Phosphorus OK",
    "K_ok": "Potassium OK",
}

router = APIRouter(prefix="/api/disease", tags=["Disease Analysis & History"])

NPK_WINDOW_DAYS = 7
NPK_FETCH_CAP = 1000

def _npk_cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=NPK_WINDOW_DAYS)

def _npk_cutoff_iso() -> str:
    return _npk_cutoff().isoformat()

def _in_last_days(value: Any, days: int = NPK_WINDOW_DAYS) -> bool:
    ts = _parse_created_at(value)
    if ts is None:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts >= datetime.now(timezone.utc) - timedelta(days=days)

def _parse_created_at(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        pass
    match = re.match(r"^(?P<head>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?P<frac>\.\d+)?(?P<tz>.*)$", text)
    if not match:
        return None
    frac = (match.group("frac") or ".0")[1:].ljust(6, "0")[:6]
    try:
        return datetime.fromisoformat(f"{match.group('head')}.{frac}{match.group('tz')}")
    except ValueError:
        return None

def _window_span(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    times = [t for t in (_parse_created_at(r.get("created_at")) for r in rows) if t]
    if not times:
        return {"oldest": None, "newest": None, "span_days": None, "days_covered": 0}
    oldest, newest = min(times), max(times)
    unique_days = {(t if t.tzinfo else t.replace(tzinfo=timezone.utc)).date().isoformat() for t in times}
    return {
        "oldest": oldest.isoformat(),
        "newest": newest.isoformat(),
        "span_days": round(max(0.0, (newest - oldest).total_seconds() / 86400.0), 1),
        "days_covered": len(unique_days),
    }

def _classify_npk_value(val: Any, nutrient: str) -> str:
    if val is None:
        return "unknown"
    try:
        val = float(val)
    except (TypeError, ValueError):
        return "unknown"
    low = NPK_THRESHOLDS[nutrient]["low"]
    high = NPK_THRESHOLDS[nutrient]["high"]
    if val < low:
        return "low"
    if val > high:
        return "high"
    return "ok"

def _advice_for_status(nutrient: str, status_key: str) -> str:
    return ADVICE_MAP.get(f"{nutrient}_{status_key}", f"{nutrient} unknown")

def _analyze_npk(npk: Dict[str, Any]) -> tuple[Dict[str, str], List[str]]:
    status: Dict[str, str] = {}
    advice: List[str] = []
    for nutrient in ("N", "P", "K"):
        key = _classify_npk_value(npk.get(nutrient), nutrient)
        status[nutrient] = key
        if key == "unknown":
            advice.append(f"{nutrient} unknown")
        else:
            advice.append(_advice_for_status(nutrient, key))
    return status, advice

def _row_to_npk(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "N": row.get("nitrogen_n") or row.get("nitrogen"),
        "P": row.get("phosphorus_p") or row.get("phosphorous"),
        "K": row.get("potassium_k") or row.get("potassium"),
        "time": row.get("created_at"),
    }

def _is_all_zero(npk: Dict[str, Any]) -> bool:
    try:
        return all(float(npk.get(n) or 0) == 0.0 for n in ("N", "P", "K"))
    except (TypeError, ValueError):
        return False

def _analyze_npk_window(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    parsed = [_row_to_npk(r) for r in rows]
    usable = [p for p in parsed if not _is_all_zero(p)]
    sample = usable if usable else parsed
    span = _window_span(rows)

    counts = {n: {"low": 0, "ok": 0, "high": 0, "unknown": 0} for n in ("N", "P", "K")}
    totals = {n: [] for n in ("N", "P", "K")}
    for npk in sample:
        for nutrient in ("N", "P", "K"):
            key = _classify_npk_value(npk.get(nutrient), nutrient)
            counts[nutrient][key] += 1
            try:
                totals[nutrient].append(float(npk[nutrient]))
            except (TypeError, ValueError):
                pass

    mean: Dict[str, Any] = {}
    majority: Dict[str, str] = {}
    advice: List[str] = []
    for nutrient in ("N", "P", "K"):
        vals = totals[nutrient]
        mean[nutrient] = round(sum(vals) / len(vals), 2) if vals else None
        bucket = counts[nutrient]
        majority[nutrient] = max(("low", "ok", "high"), key=lambda k: bucket[k]) if any(bucket[k] > 0 for k in ("low", "ok", "high")) else "unknown"
        advice.append(_advice_for_status(nutrient, majority[nutrient]))

    mean_status, mean_advice = _analyze_npk(mean)
    days_covered = int(span.get("days_covered") or 0)
    sufficient = days_covered >= NPK_WINDOW_DAYS
    prompt = None
    if not sufficient:
        prompt = f"Not enough NPK readings for a full {NPK_WINDOW_DAYS}-day window ({days_covered} day(s) with data). Please take more cocopeat NPK readings."
    names = {"N": "Nitrogen", "P": "Phosphorus", "K": "Potassium"}
    deficient = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "low"]
    excess = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "high"]
    has_deficiency = len(deficient) > 0

    if has_deficiency:
        deficiency_msg = f"Nutrient deficiency detected: {', '.join(deficient)} low."
    elif excess:
        deficiency_msg = f"No nutrient deficiency. Excess detected: {', '.join(excess)} high."
    elif any(mean_status.get(n) == "ok" for n in ("N", "P", "K")):
        deficiency_msg = "No nutrient deficiency. 7-day NPK averages are in range."
    else:
        deficiency_msg = "Not enough NPK data to detect a nutrient deficiency."

    return {
        "mode": "last_7_days",
        "days": NPK_WINDOW_DAYS,
        "sample_size": len(parsed),
        "used": len(usable) if usable else len(parsed),
        "skipped_all_zero": len(parsed) - len(usable),
        "has_deficiency": has_deficiency,
        "deficient_nutrients": deficient,
        "excess_nutrients": excess,
        "deficiency_msg": deficiency_msg,
        "oldest": span["oldest"],
        "newest": span["newest"],
        "span_days": span["span_days"],
        "days_covered": days_covered,
        "sufficient": sufficient,
        "prompt": prompt,
        "mean": mean,
        "mean_status": mean_status,
        "mean_advice": mean_advice,
        "majority_status": majority,
        "majority_advice": advice,
        "counts": counts,
    }

def _npk_rows_query(**filters: Any) -> List[Dict[str, Any]]:
    query = supabase.table("npk_history").select("*").gte("created_at", _npk_cutoff_iso())
    for key, value in filters.items():
        if value:
            query = query.eq(key, value)
    response = query.order("created_at", desc=True).limit(NPK_FETCH_CAP).execute()
    return [r for r in (response.data or []) if _in_last_days(r.get("created_at"))]

def _merge_npk_rows(*batches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    merged: List[Dict[str, Any]] = []
    for rows in batches:
        for row in rows:
            key = row.get("reading_id") or (
                row.get("created_at"),
                row.get("nitrogen_n"),
                row.get("phosphorus_p"),
                row.get("potassium_k"),
                row.get("plant_id"),
                row.get("time_slot"),
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)
    merged.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return merged

def _fetch_last_npk_rows(plant_id: str, fallback_user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    batches: List[List[Dict[str, Any]]] = []
    if plant_id:
        batches.append(_npk_rows_query(plant_id=plant_id))

    owner_id = None
    try:
        plant = supabase.table("plants").select("user_id").eq("plant_id", plant_id).limit(1).execute()
        if plant.data:
            owner_id = plant.data[0].get("user_id")
    except Exception:
        owner_id = None

    seen_users = []
    for uid in (owner_id, fallback_user_id):
        if uid and uid not in seen_users:
            seen_users.append(uid)
            batches.append(_npk_rows_query(user_id=uid))

    return _merge_npk_rows(*batches)

def _npk_history_for_plant(plant_id: str, fallback_user_id: Optional[str] = None) -> Dict[str, Any]:
    rows = _fetch_last_npk_rows(plant_id, fallback_user_id=fallback_user_id)
    empty = {"N": None, "P": None, "K": None, "time": None}
    latest = _row_to_npk(rows[0]) if rows else empty
    latest_status, latest_advice = _analyze_npk(latest)
    window = _analyze_npk_window(rows)
    return {
        "rows": rows,
        "latest": latest,
        "latest_status": latest_status,
        "latest_advice": latest_advice,
        "window": window,
    }

def _decide_verdict(predicted_class: str, confidence: float) -> str:
    if predicted_class in ("healthy", "invalid"):
        return "HEALTHY"
    if confidence >= DISEASE_CONFIDENCE_THRESHOLD:
        return "DISEASE"
    return "HEALTHY"


# ==============================================================================
# MAIN PROXIED ANALYSIS ENDPOINT
# ==============================================================================

@router.post("/analyze", status_code=status.HTTP_200_OK)
async def analyze_disease(
    plant_id: str = Form(...),
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    files_payload = {"image": (image.filename or "leaf.jpg", image_bytes, image.content_type or "image/jpeg")}
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}

    # Proxy call to Hugging Face
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            res = await client.post(f"{ML_SERVICE_URL}/predict/disease", files=files_payload, headers=headers)
            res.raise_for_status()
            pred = res.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"ML Service Error: {exc.response.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not connect to ML service: {str(e)}")

    predicted_class = pred["predicted_class"]
    confidence = float(pred["confidence"])
    rec = RECOMMENDATIONS.get(predicted_class, RECOMMENDATIONS["healthy"])
    verdict = _decide_verdict(predicted_class, confidence)
    conf_pct = round(confidence * 100, 2)

    if verdict == "DISEASE":
        verdict_msg = f"{rec['label']} detected ({conf_pct:.0f}% confidence) — here's the treatment."
    elif predicted_class == "invalid":
        verdict_msg = rec["disease_info"]
    elif predicted_class not in ("healthy", "invalid") and confidence < DISEASE_CONFIDENCE_THRESHOLD:
        verdict_msg = f"Possible {rec['label']} at {conf_pct:.0f}% confidence (below {int(DISEASE_CONFIDENCE_THRESHOLD * 100)}% threshold) — treating as healthy."
    else:
        verdict_msg = f"Leaf looks healthy ({conf_pct:.0f}% confidence)."

    npk_pack = _npk_history_for_plant(plant_id, fallback_user_id=current_user.get("user_id"))
    npk = npk_pack["latest"]
    npk_status = npk_pack["latest_status"]
    npk_advice = npk_pack["latest_advice"]
    npk_window = npk_pack["window"]

    # Resolve owner
    plant_query = supabase.table("plants").select("user_id").eq("plant_id", plant_id).execute()
    owner_id = plant_query.data[0]["user_id"] if plant_query.data else current_user["user_id"]

    payload = {
        "user_id": owner_id,
        "plant_id": plant_id,
        "verdict": verdict,
        "disease_name": rec["label"],
        "disease_info": rec["disease_info"],
        "confidence": conf_pct,
        "treatment": rec["treatment"],
        "npk_reading": {"latest": npk, "window": npk_window},
        "npk_status": npk_status,
        "npk_advice": npk_advice,
        "result_image_b64": pred["result_image"],
    }

    saved = supabase.table("disease_analysis").insert(payload).execute()

    return {
        "verdict": verdict,
        "verdict_msg": verdict_msg,
        "disease_name": rec["label"],
        "disease_info": rec["disease_info"],
        "confidence": conf_pct,
        "treatment": rec["treatment"],
        "npk": npk,
        "npk_status": npk_status,
        "npk_advice": npk_advice,
        "npk_window": npk_window,
        "result_image": pred["result_image"],
        "ensemble": {
            "predicted_class": predicted_class,
            "confidence": round(confidence, 4),
            "threshold": DISEASE_CONFIDENCE_THRESHOLD,
            "yolo": pred.get("yolo"),
            "mobilenet": pred.get("mobilenet"),
            "cnn": pred.get("cnn"),
            "ensemble_probs": pred.get("ensemble_probs"),
        },
        "record": saved.data[0] if saved.data else None,
    }


def _npk_history_payload(plant_id: str, fallback_user_id: Optional[str]) -> Dict[str, Any]:
    pack = _npk_history_for_plant(plant_id, fallback_user_id=fallback_user_id)
    return {
        "data": pack["rows"],
        "total": len(pack["rows"]),
        "days": NPK_WINDOW_DAYS,
        "window": pack["window"],
    }

@router.get("/plant/{plant_id}/npk-history", status_code=status.HTTP_200_OK)
@router.get("/npk-history/{plant_id}", status_code=status.HTTP_200_OK)
def get_plant_npk_count_window(plant_id: str, user_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return _npk_history_payload(plant_id, user_id or current_user.get("user_id"))

@router.get("", status_code=status.HTTP_200_OK)
def get_all_disease_records(current_user: dict = Depends(get_current_user)):
    res = supabase.table("disease_analysis").select("*").eq("user_id", current_user["user_id"]).is_("deleted_at", "null").order("created_at", desc=True).execute()
    return res.data

@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_plant_disease_history(plant_id: str, page: int = 1, limit: int = 10, include_npk: bool = False, user_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    start = (page - 1) * limit
    res = supabase.table("disease_analysis").select("*", count="exact").eq("plant_id", plant_id).is_("deleted_at", "null").order("created_at", desc=True).range(start, start + limit - 1).execute()
    payload = {"data": res.data, "total": res.count, "page": page, "limit": limit}
    if include_npk:
        pack = _npk_history_for_plant(plant_id, fallback_user_id=user_id or current_user.get("user_id"))
        payload["npk_data"] = pack["rows"]
        payload["npk_window"] = pack["window"]
        payload["days"] = NPK_WINDOW_DAYS
    return payload

@router.get("/{analysis_id}", status_code=status.HTTP_200_OK)
def get_disease_record_by_id(analysis_id: str, current_user: dict = Depends(get_current_user)):
    res = supabase.table("disease_analysis").select("*").eq("analysis_id", analysis_id).is_("deleted_at", "null").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return res.data[0]

@router.delete("/{analysis_id}", status_code=status.HTTP_200_OK)
def soft_delete_analysis_record(analysis_id: str, current_user: dict = Depends(get_current_user)):
    res = supabase.table("disease_analysis").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("analysis_id", analysis_id).is_("deleted_at", "null").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"message": "Disease record soft deleted successfully."}