from typing import Literal, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class DHT11Create(BaseModel):
    temperature: float
    humidity: float
    location_id: str
    module_id: str
    time_slot: Literal["morning", "afternoon", "evening"]


class DHT11AssessmentCreate(BaseModel):
    avg_temperature: float
    avg_humidity: float
    suitability_status: str
    target_species: Optional[str] = "Dendrobium"
    notes: Optional[str] = None
    module_id: str


router = APIRouter(prefix="/api/sensors/dht11", tags=["DHT11 Sensor"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dht11_reading(
    reading: DHT11Create, current_user: dict = Depends(get_current_user)
):
    """Log a new daily temperature/humidity reading into dht11_environment_history."""
    target_user_id = current_user["user_id"]

    response = (
        supabase.table("dht11_environment_history")
        .insert(
            {
                "temperature": reading.temperature,
                "humidity": reading.humidity,
                "time_slot": reading.time_slot,
                "location_id": reading.location_id,
                "module_id": reading.module_id,
                "user_id": target_user_id,
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to log DHT11 reading.")

    return response.data[0]


@router.post("/assessment", status_code=status.HTTP_201_CREATED)
def create_dht11_assessment(
    data: DHT11AssessmentCreate, current_user: dict = Depends(get_current_user)
):
    """Log a 1-minute burst suitability test into dht11_suitability_assessments."""
    target_user_id = current_user["user_id"]

    response = (
        supabase.table("dht11_suitability_assessments")
        .insert(
            {
                "avg_temperature": data.avg_temperature,
                "avg_humidity": data.avg_humidity,
                "suitability_status": data.suitability_status,
                "target_species": data.target_species,
                "notes": data.notes,
                "module_id": data.module_id,
                "user_id": target_user_id,
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=500, detail="Failed to log DHT11 suitability assessment."
        )

    return response.data[0]


# ---------------------------------------------------------
# FETCH READINGS BY PLANT (LOCATION-SCOPED)
# ---------------------------------------------------------


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_dht11_readings_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Fetch DHT11 readings associated with the plant's location."""
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
        supabase.table("dht11_environment_history")
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
