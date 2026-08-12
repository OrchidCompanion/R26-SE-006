from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class BH1750Create(BaseModel):
    lux: float
    plant_id: str
    module_id: str


router = APIRouter(prefix="/api/sensors/bh1750", tags=["BH1750 Light Sensor"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_bh1750_reading(
    reading: BH1750Create, current_user: dict = Depends(get_current_user)
):
    """Log a new light intensity (lux) reading."""
    response = (
        supabase.table("bh1750_sensor")
        .insert(
            {
                "lux": reading.lux,
                "plant_id": reading.plant_id,
                "module_id": reading.module_id,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to log reading.")

    return response.data[0]


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_bh1750_readings_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Fetch BH1750 light readings for a specific plant with pagination."""
    start = (page - 1) * limit
    end = start + limit - 1
    response = (
        supabase.table("bh1750_sensor")
        .select("*", count="exact")
        .eq("plant_id", plant_id)
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


@router.get("", status_code=status.HTTP_200_OK)
def get_all_bh1750_readings(
    current_user: dict = Depends(get_current_user), limit: int = 50
):
    """View recent light readings."""
    response = (
        supabase.table("bh1750_sensor")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data


@router.get("/{reading_id}", status_code=status.HTTP_200_OK)
def get_bh1750_reading_by_id(
    reading_id: str, current_user: dict = Depends(get_current_user)
):
    """Get reading by ID."""
    response = (
        supabase.table("bh1750_sensor")
        .select("*")
        .eq("reading_id", reading_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return response.data[0]


@router.delete("/{reading_id}", status_code=status.HTTP_200_OK)
def delete_bh1750_reading(
    reading_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a light reading entry."""
    response = (
        supabase.table("bh1750_sensor")
        .delete()
        .eq("reading_id", reading_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return {"message": "Reading deleted successfully."}
