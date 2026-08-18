from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


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