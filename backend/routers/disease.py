import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user
from services.model_service import ensemble_predict

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


class DiseaseRecordCreate(BaseModel):
    plant_id: str
    verdict: str  # e.g., "HEALTHY" or "DISEASE"
    disease_name: str
    disease_info: Optional[str] = None
    confidence: Optional[float] = None
    treatment: Optional[List[str]] = None
    npk_reading: Optional[Dict[str, Any]] = None
    npk_status: Optional[Dict[str, Any]] = None
    npk_advice: Optional[List[str]] = None
    result_image_b64: Optional[str] = None


class DiseaseRecordUpdate(BaseModel):
    verdict: Optional[str] = None
    disease_name: Optional[str] = None
    disease_info: Optional[str] = None
    confidence: Optional[float] = None
    treatment: Optional[List[str]] = None
    npk_reading: Optional[Dict[str, Any]] = None
    npk_status: Optional[Dict[str, Any]] = None
    npk_advice: Optional[List[str]] = None
    result_image_b64: Optional[str] = None


router = APIRouter(prefix="/api/disease", tags=["Disease Analysis & History"])


# Time-based window: only last 7 days. Older "good" readings must not hide
# a current deficiency when averages are computed.
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
    # Python 3.10 rejects fractional seconds that are not 3 or 6 digits
    # (Supabase often sends values like .17949).
    match = re.match(
        r"^(?P<head>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?P<frac>\.\d+)?(?P<tz>.*)$",
        text,
    )
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
    unique_days = {
        (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).date().isoformat()
        for t in times
    }
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
        "N": row.get("nitrogen_n"),
        "P": row.get("phosphorus_p"),
        "K": row.get("potassium_k"),
        "time": row.get("created_at"),
    }


def _is_all_zero(npk: Dict[str, Any]) -> bool:
    try:
        return all(float(npk.get(n) or 0) == 0.0 for n in ("N", "P", "K"))
    except (TypeError, ValueError):
        return False


def _analyze_npk_window(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mean + majority low/ok/high over last-7-days readings only."""
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
        majority[nutrient] = max(
            ("low", "ok", "high"),
            key=lambda k: bucket[k],
        ) if any(bucket[k] > 0 for k in ("low", "ok", "high")) else "unknown"
        advice.append(_advice_for_status(nutrient, majority[nutrient]))

    mean_status, mean_advice = _analyze_npk(mean)
    days_covered = int(span.get("days_covered") or 0)
    sufficient = days_covered >= NPK_WINDOW_DAYS
    prompt = None
    if not sufficient:
        prompt = (
            f"Not enough NPK readings for a full {NPK_WINDOW_DAYS}-day window "
            f"({days_covered} day(s) with data). Please take more cocopeat NPK readings."
        )
    return {
        "mode": "last_7_days",
        "days": NPK_WINDOW_DAYS,
        "sample_size": len(parsed),
        "used": len(usable) if usable else len(parsed),
        "skipped_all_zero": len(parsed) - len(usable),
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
    query = (
        supabase.table("npk_history")
        .select("*")
        .gte("created_at", _npk_cutoff_iso())
    )
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


def _fetch_last_npk_rows(
    plant_id: str,
    fallback_user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Last 7 days of NPK rows for this plant's household (not last-N rows).

    Merges plant_id + owner + selected user + those users' sensor modules
    so a plant with no tagged rows still shows the owner's recent readings.
    """
    batches: List[List[Dict[str, Any]]] = []
    if plant_id:
        batches.append(_npk_rows_query(plant_id=plant_id))

    owner_id = None
    try:
        plant = (
            supabase.table("plants")
            .select("user_id")
            .eq("plant_id", plant_id)
            .limit(1)
            .execute()
        )
        if plant.data:
            owner_id = plant.data[0].get("user_id")
    except Exception:
        owner_id = None

    seen_users = []
    for uid in (owner_id, fallback_user_id):
        if uid and uid not in seen_users:
            seen_users.append(uid)
            batches.append(_npk_rows_query(user_id=uid))

    module_ids: List[str] = []
    for uid in seen_users:
        try:
            mods = (
                supabase.table("sensor_module")
                .select("module_id")
                .eq("user_id", uid)
                .execute()
            )
            module_ids.extend(
                m["module_id"] for m in (mods.data or []) if m.get("module_id")
            )
        except Exception:
            continue

    module_ids = list(dict.fromkeys(module_ids))
    if module_ids:
        response = (
            supabase.table("npk_history")
            .select("*")
            .in_("module_id", module_ids)
            .gte("created_at", _npk_cutoff_iso())
            .order("created_at", desc=True)
            .limit(NPK_FETCH_CAP)
            .execute()
        )
        batches.append(
            [r for r in (response.data or []) if _in_last_days(r.get("created_at"))]
        )

    return _merge_npk_rows(*batches)


def _npk_history_for_plant(
    plant_id: str,
    fallback_user_id: Optional[str] = None,
) -> Dict[str, Any]:
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


@router.post("/analyze", status_code=status.HTTP_200_OK)
async def analyze_disease(
    plant_id: str = Form(...),
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a leaf image, run YOLO crop + MobileNetV2 + CNN ensemble,
    apply the 0.6 confidence decision rule, and persist to disease_analysis.
    """
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    try:
        pred = ensemble_predict(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}") from exc

    predicted_class = pred["predicted_class"]
    confidence = float(pred["confidence"])
    rec = RECOMMENDATIONS.get(predicted_class, RECOMMENDATIONS["healthy"])
    verdict = _decide_verdict(predicted_class, confidence)
    conf_pct = round(confidence * 100, 2)

    if verdict == "DISEASE":
        verdict_msg = (
            f"{rec['label']} detected ({conf_pct:.0f}% confidence) — here's the treatment."
        )
    elif predicted_class == "invalid":
        verdict_msg = rec["disease_info"]
    elif predicted_class not in ("healthy", "invalid") and confidence < DISEASE_CONFIDENCE_THRESHOLD:
        verdict_msg = (
            f"Possible {rec['label']} at {conf_pct:.0f}% confidence "
            f"(below {int(DISEASE_CONFIDENCE_THRESHOLD * 100)}% threshold) — treating as healthy."
        )
    else:
        verdict_msg = f"Leaf looks healthy ({conf_pct:.0f}% confidence)."

    npk_pack = _npk_history_for_plant(
        plant_id, fallback_user_id=current_user.get("user_id")
    )
    npk = npk_pack["latest"]
    npk_status = npk_pack["latest_status"]
    npk_advice = npk_pack["latest_advice"]
    npk_window = npk_pack["window"]

    plant_query = (
        supabase.table("plants")
        .select("user_id")
        .eq("plant_id", plant_id)
        .execute()
    )
    owner_id = (
        plant_query.data[0]["user_id"] if plant_query.data else current_user["user_id"]
    )

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
            "yolo": pred["yolo"],
            "mobilenet": pred["mobilenet"],
            "cnn": pred["cnn"],
            "ensemble_probs": pred["ensemble_probs"],
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
def get_plant_npk_count_window(
    plant_id: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """NPK rows from the last 7 days only."""
    return _npk_history_payload(
        plant_id, user_id or current_user.get("user_id")
    )


# CREATE
@router.post("", status_code=status.HTTP_201_CREATED)
def create_disease_record(
    data: DiseaseRecordCreate, current_user: dict = Depends(get_current_user)
):
    """Create/Log a disease record directly."""
    # Find plant owner
    plant_query = (
        supabase.table("plants")
        .select("user_id")
        .eq("plant_id", data.plant_id)
        .execute()
    )
    owner_id = (
        plant_query.data[0]["user_id"]
        if plant_query.data
        else current_user["user_id"]
    )

    payload = {
        "user_id": owner_id,
        "plant_id": data.plant_id,
        "verdict": data.verdict,
        "disease_name": data.disease_name,
        "disease_info": data.disease_info,
        "confidence": data.confidence,
        "treatment": data.treatment,
        "npk_reading": data.npk_reading,
        "npk_status": data.npk_status,
        "npk_advice": data.npk_advice,
        "result_image_b64": data.result_image_b64,
    }

    response = supabase.table("disease_analysis").insert(payload).execute()

    if not response.data:
        raise HTTPException(
            status_code=500, detail="Failed to save disease record."
        )

    return response.data[0]


# READ ALL (USER)
@router.get("", status_code=status.HTTP_200_OK)
def get_all_disease_records(current_user: dict = Depends(get_current_user)):
    """Get all active disease records for the current user."""
    response = (
        supabase.table("disease_analysis")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


# READ BY PLANT (PAGINATED)
@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_plant_disease_history(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    include_npk: bool = False,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Fetch disease history for a plant with pagination."""
    start = (page - 1) * limit
    res = (
        supabase.table("disease_analysis")
        .select("*", count="exact")
        .eq("plant_id", plant_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(start, start + limit - 1)
        .execute()
    )
    payload = {
        "data": res.data,
        "total": res.count,
        "page": page,
        "limit": limit,
    }
    if include_npk:
        pack = _npk_history_for_plant(
            plant_id, fallback_user_id=user_id or current_user.get("user_id")
        )
        payload["npk_data"] = pack["rows"]
        payload["npk_window"] = pack["window"]
        payload["days"] = NPK_WINDOW_DAYS
    return payload


# READ BY ID
@router.get("/{analysis_id}", status_code=status.HTTP_200_OK)
def get_disease_record_by_id(
    analysis_id: str, current_user: dict = Depends(get_current_user)
):
    """Get single disease record by ID."""
    response = (
        supabase.table("disease_analysis")
        .select("*")
        .eq("analysis_id", analysis_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return response.data[0]


# UPDATE
@router.put("/{analysis_id}", status_code=status.HTTP_200_OK)
def update_disease_record(
    analysis_id: str,
    data: DiseaseRecordUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing disease record."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided.")

    response = (
        supabase.table("disease_analysis")
        .update(update_fields)
        .eq("analysis_id", analysis_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found or update failed.")

    return response.data[0]


# DELETE (SOFT DELETE)
@router.delete("/{analysis_id}", status_code=status.HTTP_200_OK)
def soft_delete_analysis_record(
    analysis_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft delete disease record."""
    res = (
        supabase.table("disease_analysis")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("analysis_id", analysis_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"message": "Disease record soft deleted successfully."}