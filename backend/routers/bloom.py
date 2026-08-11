from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class BloomCreate(BaseModel):
    weeks: int
    plant_id: str


class BloomUpdate(BaseModel):
    weeks: Optional[int] = None


router = APIRouter(prefix="/api/bloom", tags=["Predicted Bloom"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_bloom_prediction(
    data: BloomCreate, current_user: dict = Depends(get_current_user)
):
    """Record a new predicted bloom timeline."""
    response = (
        supabase.table("predicted_bloom")
        .insert(
            {
                "weeks": data.weeks,
                "plant_id": data.plant_id,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=500, detail="Failed to record bloom prediction."
        )

    return response.data[0]


@router.get("")
def get_all_bloom_predictions(current_user: dict = Depends(get_current_user)):
    """Get all active predicted bloom records."""
    response = (
        supabase.table("predicted_bloom")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    return response.data


@router.get("/{record_id}")
def get_bloom_prediction_by_id(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Get prediction record by ID."""
    response = (
        supabase.table("predicted_bloom")
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
def update_bloom_prediction(
    record_id: str, data: BloomUpdate, current_user: dict = Depends(get_current_user)
):
    """Update prediction record."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided.")

    response = (
        supabase.table("predicted_bloom")
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
def soft_delete_bloom_prediction(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft delete bloom prediction record."""
    response = (
        supabase.table("predicted_bloom")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")

    return {"message": "Bloom record soft deleted successfully."}
