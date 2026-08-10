from enum import Enum
from fastapi import APIRouter, HTTPException, status
from database import supabase


class StatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"


router = APIRouter(
    prefix="/api/sensors/dht11",
    tags=["DHT11 Sensor"]
)


# --- Read & Delete Endpoints for Frontend (React Web & Mobile App) ---

@router.get("/plant/{plant_id}")
def get_plant_sensor_history(plant_id: int, include_inactive: bool = False, limit: int = 50):
    """Fetch sensor reading history for a specific plant to plot charts."""
    query = supabase.table("dht11_sensor_data").select("*").eq("plant_id", plant_id)

    if not include_inactive:
        query = query.eq("status", "active")

    response = query.order("timestamp", desc=True).limit(limit).execute()
    return response.data


@router.get("/plant/{plant_id}/latest")
def get_latest_plant_sensor_reading(plant_id: int):
    """Fetch the most recent sensor reading for live plant status card display."""
    response = (
        supabase.table("dht11_sensor_data")
        .select("*")
        .eq("plant_id", plant_id)
        .eq("status", "active")
        .order("timestamp", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active sensor data found for plant ID {plant_id}."
        )

    return response.data[0]


@router.delete("/{record_id}")
def soft_delete_sensor_reading(record_id: int):
    """Soft delete a specific sensor reading record."""
    response = (
        supabase.table("dht11_sensor_data")
        .update({"status": StatusEnum.inactive.value})
        .eq("record_id", record_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Record ID {record_id} not found."
        )

    return {"message": f"Sensor reading {record_id} marked as inactive."}