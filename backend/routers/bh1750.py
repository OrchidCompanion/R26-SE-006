from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class BH1750Create(BaseModel):
    lux: float
    location_id: str
    module_id: str
    time_slot: Optional[str] = "custom"


router = APIRouter(prefix="/api/sensors/bh1750", tags=["BH1750 Light Sensor"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_bh1750_reading(
    reading: BH1750Create, current_user: dict = Depends(get_current_user)
):
    """Log a new light reading into bh1750_environment_history."""
    response = (
        supabase.table("bh1750_environment_history")
        .insert(
            {
                "lux": reading.lux,
                "time_slot": reading.time_slot,
                "location_id": reading.location_id,
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
    """Fetch BH1750 light readings via the plant's assigned location."""
    plant_res = (
        supabase.table("plants")
        .select("location_id")
        .eq("plant_id", plant_id)
        .execute()
    )

    if not plant_res.data or not plant_res.data[0].get("location_id"):
        return {"data": [], "total": 0, "page": page, "limit": limit}

    location_id = plant_res.data[0]["location_id"]
    start = (page - 1) * limit
    end = start + limit - 1

    response = (
        supabase.table("bh1750_environment_history")
        .select("*", count="exact")
        .eq("location_id", location_id)
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
