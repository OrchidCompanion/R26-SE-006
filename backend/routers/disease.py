from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class DiseaseCreate(BaseModel):
    disease: str
    plant_id: str


class DiseaseUpdate(BaseModel):
    disease: Optional[str] = None


router = APIRouter(prefix="/api/disease", tags=["Disease History"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_disease_record(
    data: DiseaseCreate, current_user: dict = Depends(get_current_user)
):
    """Log a plant disease observation."""
    response = (
        supabase.table("disease_history")
        .insert(
            {
                "disease": data.disease,
                "plant_id": data.plant_id,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to log disease history.")

    return response.data[0]


@router.get("")
def get_all_disease_records(current_user: dict = Depends(get_current_user)):
    """Get all active disease records."""
    response = (
        supabase.table("disease_history")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    return response.data


@router.get("/{record_id}")
def get_disease_record_by_id(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Get disease record by ID."""
    response = (
        supabase.table("disease_history")
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
def update_disease_record(
    record_id: str, data: DiseaseUpdate, current_user: dict = Depends(get_current_user)
):
    """Update disease record."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided.")

    response = (
        supabase.table("disease_history")
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
def soft_delete_disease_record(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft delete disease history record."""
    response = (
        supabase.table("disease_history")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")

    return {"message": "Disease record soft deleted successfully."}
