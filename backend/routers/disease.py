from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
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
            "Remove infected leaves immediately",
            "Apply copper-based fungicide",
            "Reduce watering frequency",
            "Improve air circulation",
        ],
    },
    "bacterial_brown_spot": {
        "label": "Bacterial Brown Spot",
        "disease_info": "Bacterial Brown Spot detected.",
        "treatment": [
            "Remove and destroy infected parts",
            "Apply bactericide",
            "Avoid overhead watering",
            "Sterilize cutting tools",
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
    "K_high": "Leach soil with water",
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


def _analyze_npk(npk: Dict[str, Any]) -> tuple[Dict[str, str], List[str]]:
    status: Dict[str, str] = {}
    advice: List[str] = []
    for nutrient in ("N", "P", "K"):
        val = npk.get(nutrient)
        if val is None:
            status[nutrient] = "unknown"
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            status[nutrient] = "unknown"
            continue
        low = NPK_THRESHOLDS[nutrient]["low"]
        high = NPK_THRESHOLDS[nutrient]["high"]
        if val < low:
            key = f"{nutrient}_low"
        elif val > high:
            key = f"{nutrient}_high"
        else:
            key = f"{nutrient}_ok"
        status[nutrient] = key.split("_")[1]
        advice.append(ADVICE_MAP[key])
    return status, advice


def _latest_npk_for_plant(plant_id: str) -> Dict[str, Any]:
    response = (
        supabase.table("npk_history")
        .select("nitrogen_n, phosphorus_p, potassium_k, created_at")
        .eq("plant_id", plant_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return {"N": None, "P": None, "K": None, "time": None}
    row = response.data[0]
    return {
        "N": row.get("nitrogen_n"),
        "P": row.get("phosphorus_p"),
        "K": row.get("potassium_k"),
        "time": row.get("created_at"),
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

    npk = _latest_npk_for_plant(plant_id)
    npk_status, npk_advice = _analyze_npk(npk)

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
        "npk_reading": npk,
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
    return {"data": res.data, "total": res.count, "page": page, "limit": limit}


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