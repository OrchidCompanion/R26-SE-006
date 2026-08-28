from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


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