from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class DHT11Create(BaseModel):
    temperature: float
    humidity: float
    plant_id: str
    module_id: str


router = APIRouter(prefix="/api/sensors/dht11", tags=["DHT11 Sensor"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dht11_reading(
    reading: DHT11Create, current_user: dict = Depends(get_current_user)
):
    """Log a new temperature/humidity reading."""
    response = (
        supabase.table("dht11_sensor")
        .insert(
            {
                "temperature": reading.temperature,
                "humidity": reading.humidity,
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
def get_dht11_readings_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Fetch DHT11 temperature/humidity readings for a plant with pagination."""
    start = (page - 1) * limit
    end = start + limit - 1
    response = (
        supabase.table("dht11_sensor")
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
def get_all_dht11_readings(
    current_user: dict = Depends(get_current_user), limit: int = 50
):
    """View recent DHT11 readings for current user."""
    response = (
        supabase.table("dht11_sensor")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data


@router.get("/{reading_id}", status_code=status.HTTP_200_OK)
def get_dht11_reading_by_id(
    reading_id: str, current_user: dict = Depends(get_current_user)
):
    """Get DHT11 reading by reading_id."""
    response = (
        supabase.table("dht11_sensor")
        .select("*")
        .eq("reading_id", reading_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return response.data[0]


@router.delete("/{reading_id}", status_code=status.HTTP_200_OK)
def delete_dht11_reading(
    reading_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a reading entry."""
    response = (
        supabase.table("dht11_sensor")
        .delete()
        .eq("reading_id", reading_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return {"message": "Reading deleted successfully."}
