from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class NPKCreate(BaseModel):
    nitrogen_n: float
    phosphorus_p: float
    potassium_k: float
    plant_id: str
    module_id: str


router = APIRouter(prefix="/api/sensors/npk", tags=["NPK Soil Sensor"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_npk_reading(
    reading: NPKCreate, current_user: dict = Depends(get_current_user)
):
    """Log NPK soil nutrient levels into npk_history."""
    response = (
        supabase.table("npk_history")
        .insert(
            {
                "nitrogen_n": reading.nitrogen_n,
                "phosphorus_p": reading.phosphorus_p,
                "potassium_k": reading.potassium_k,
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
def get_npk_readings_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 90,
    current_user: dict = Depends(get_current_user),
):
    """Fetch NPK history for a specific plant with pagination."""
    start = (page - 1) * limit
    end = start + limit - 1

    response = (
        supabase.table("npk_history")
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
def get_all_npk_readings(
    current_user: dict = Depends(get_current_user), limit: int = 50
):
    """View recent NPK history records."""
    response = (
        supabase.table("npk_history")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data
