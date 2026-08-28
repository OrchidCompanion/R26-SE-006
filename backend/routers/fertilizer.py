import shutil
import tempfile
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user

try:
    from routers.npk import get_latest_npk_data
except Exception:
    def get_latest_npk_data(plant_id=None, user_id=None):
        return {"nitrogen": 0.0, "phosphorous": 0.0, "potassium": 0.0, "device_id": "no-sensor-reading"}


def _get_predict_single_leaf():
    """Helper to lazily import leaf prediction pipeline."""
    try:
        from routers.predict_new_leaf import predict_single_leaf
        return predict_single_leaf
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ML leaf prediction error: {str(e)}. Please run 'pip install -r requirements.txt' to install ultralytics and OpenCV."
        )


def _get_evaluate_npk():
    """Helper to lazily import NPK recommendation engine."""
    try:
        from routers.npk_recomendation import evaluate_npk
        return evaluate_npk
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"NPK recommendation engine error: {str(e)}."
        )


class FertilizerCreate(BaseModel):
    fertilizer: str
    qty: float
    unit: str
    plant_id: str


class FertilizerUpdate(BaseModel):
    fertilizer: Optional[str] = None
    qty: Optional[float] = None
    unit: Optional[str] = None


router = APIRouter(prefix="/api/fertilizer", tags=["Fertilizer Requirements"])


# =========================================================
# GROWTH STAGE ANALYSIS & FERTILIZER RECOMMENDATION PIPELINE
# =========================================================

@router.post("/analyze", status_code=status.HTTP_200_OK)
@router.post("/predict", status_code=status.HTTP_200_OK)
@router.post("/predict-growth", status_code=status.HTTP_200_OK)
async def analyze_growth_stage(
    leaf_count: int = Form(...),
    image: UploadFile = File(...),
    plant_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload an image + leaf count, runs the full analysis pipeline:
    (YOLO segmentation -> OpenCV length/width/area -> ML growth stage prediction
    -> NPK recommendation using latest sensor reading).
    """
    predict_single_leaf = _get_predict_single_leaf()
    evaluate_npk = _get_evaluate_npk()

    suffix = Path(image.filename).suffix if image.filename else ".jpg"
    if not suffix or suffix == ".":
        suffix = ".jpg"

    # Save uploaded image to a temporary file for YOLO & OpenCV processing
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(image.file, tmp)
        tmp_path = tmp.name

    try:
        result = predict_single_leaf(tmp_path, leaf_count)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image analysis error: {str(e)}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    stage = result["growth_stage"]

    # Fetch latest NPK reading for this plant/user or in-memory fallback
    npk_data = get_latest_npk_data(plant_id=plant_id, user_id=current_user["user_id"])
    n_val = npk_data["nitrogen"]
    p_val = npk_data["phosphorous"]
    k_val = npk_data["potassium"]

    npk_result = evaluate_npk(
        stage=stage,
        nitrogen=n_val,
        phosphorous=p_val,
        potassium=k_val,
    )

    # Normalize confidence to decimal (0.0 - 1.0)
    conf_val = result["confidence"]
    conf_decimal = conf_val / 100.0 if conf_val > 1.0 else conf_val

    # Log requirement to database if plant_id is present
    if plant_id:
        target_ratio = npk_result.get("target_ratio", "")
        try:
            supabase.table("fertilizer_requirements").insert({
                "fertilizer": f"NPK Ratio {target_ratio} ({stage})",
                "qty": 1.0,
                "unit": "application",
                "plant_id": plant_id,
                "user_id": current_user["user_id"],
            }).execute()
        except Exception as e:
            print(f"[Fertilizer Router] Failed to save requirement: {e}")

    return {
        "plant_id": plant_id,
        "user_id": current_user["user_id"],
        "leaf_length_cm": result["opencv_leaf_length_cm"],
        "leaf_width_cm": result["opencv_leaf_width_cm"],
        "leaf_area_cm2": result["opencv_leaf_area_cm2"],
        "leaf_count": leaf_count,
        "growth_stage": stage,
        "confidence": conf_decimal,
        "npk_reading": {
            "nitrogen": n_val,
            "phosphorous": p_val,
            "potassium": k_val,
            "device_id": npk_data.get("device_id") or "esp32-npk-01",
        },
        "npk_recommendation": npk_result,
    }



@router.post("", status_code=status.HTTP_201_CREATED)
def create_fertilizer_req(
    data: FertilizerCreate, current_user: dict = Depends(get_current_user)
):
    """Log fertilizer application schedule or dosage requirement."""
    response = (
        supabase.table("fertilizer_requirements")
        .insert(
            {
                "fertilizer": data.fertilizer,
                "qty": data.qty,
                "unit": data.unit,
                "plant_id": data.plant_id,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=500, detail="Failed to log fertilizer requirement."
        )

    return response.data[0]


@router.get("")
def get_all_fertilizer_reqs(current_user: dict = Depends(get_current_user)):
    """Get all active fertilizer records."""
    response = (
        supabase.table("fertilizer_requirements")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    return response.data


@router.get("/{record_id}")
def get_fertilizer_req_by_id(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Get fertilizer record by ID."""
    response = (
        supabase.table("fertilizer_requirements")
        .select("*")
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return response.data[0]


@router.put("/{record_id}")
def update_fertilizer_req(
    record_id: str,
    data: FertilizerUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update fertilizer record."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided.")

    response = (
        supabase.table("fertilizer_requirements")
        .update(update_fields)
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")

    return response.data[0]


@router.delete("/{record_id}")
def soft_delete_fertilizer_req(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft delete fertilizer requirement record."""
    response = (
        supabase.table("fertilizer_requirements")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")

    return {"message": "Fertilizer record soft deleted successfully."}


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_fertilizer_reqs_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Fetch fertilizer schedule records for a specific plant with pagination."""
    start = (page - 1) * limit
    end = start + limit - 1
    response = (
        supabase.table("fertilizer_requirements")
        .select("*", count="exact")
        .eq("plant_id", plant_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(start, end)
        .execute()
    )
    return {
        "data": response.data,
        "total": response.count if response.count is not None else len(response.data),
        "page": page,
        "limit": limit,
    }


