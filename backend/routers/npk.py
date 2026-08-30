from typing import Optional, Dict, Any, Literal, List
from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Depends,
)
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user

latest_reading: Dict[str, Optional[Any]] = {
    "nitrogen": None,
    "phosphorous": None,
    "potassium": None,
    "device_id": None,
    "plant_id": None,
    "user_id": None,
}

latest_readings_by_plant: Dict[str, dict] = {}


class NPKReading(BaseModel):
    nitrogen: float
    phosphorous: float
    potassium: float
    device_id: Optional[str] = None
    plant_id: Optional[str] = None
    user_id: Optional[str] = None


class NPKCreate(BaseModel):
    nitrogen_n: float
    phosphorus_p: float
    potassium_k: float
    plant_id: str
    module_id: str
    time_slot: Literal["morning", "afternoon", "evening"]


router = APIRouter(
    prefix="/api/sensors/npk",
    tags=["NPK Soil Sensor"],
)


def get_latest_npk_data(
    plant_id: Optional[str] = None, user_id: Optional[str] = None
) -> dict:
    """
    Helper to fetch the latest NPK reading.
    Checks Supabase DB first if plant_id is given, then falls back to in-memory store.
    """
    if plant_id:
        latest_reading["plant_id"] = plant_id
        if user_id:
            latest_reading["user_id"] = user_id

        try:
            query = supabase.table("npk_history").select("*").eq("plant_id", plant_id)
            if user_id:
                query = query.eq("user_id", user_id)
            response = query.order("created_at", desc=True).limit(1).execute()
            if response.data:
                rec = response.data[0]
                return {
                    "nitrogen": float(rec.get("nitrogen_n", 0.0)),
                    "phosphorous": float(rec.get("phosphorus_p", 0.0)),
                    "potassium": float(rec.get("potassium_k", 0.0)),
                    "device_id": rec.get("module_id") or "esp32-npk-01",
                    "plant_id": plant_id,
                    "user_id": rec.get("user_id") or user_id,
                }
        except Exception as e:
            print(f"[NPK Router] DB fetch error for plant {plant_id}: {e}")

    # Check plant-specific in-memory store
    if plant_id and plant_id in latest_readings_by_plant:
        return latest_readings_by_plant[plant_id]

    # Check global in-memory store
    if latest_reading["nitrogen"] is not None:
        return {
            "nitrogen": float(latest_reading["nitrogen"]),
            "phosphorous": float(latest_reading["phosphorous"]),
            "potassium": float(latest_reading["potassium"]),
            "device_id": latest_reading.get("device_id") or "esp32-npk-01",
            "plant_id": latest_reading.get("plant_id") or plant_id,
            "user_id": latest_reading.get("user_id") or user_id,
        }

    # Default baseline reading
    return {
        "nitrogen": 0.0,
        "phosphorous": 0.0,
        "potassium": 0.0,
        "device_id": "no-sensor-reading",
        "plant_id": plant_id,
        "user_id": user_id,
    }


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_npk_readings(
    readings: List[NPKCreate],
    current_user: dict = Depends(get_current_user),
):
    """
    Bulk insert NPK sensor history records for an authenticated user.
    """
    if not readings:
        raise HTTPException(
            status_code=400,
            detail="Payload array cannot be empty.",
        )

    records = [
        {
            "nitrogen_n": r.nitrogen_n,
            "phosphorus_p": r.phosphorus_p,
            "potassium_k": r.potassium_k,
            "plant_id": r.plant_id,
            "module_id": r.module_id,
            "time_slot": r.time_slot,
            "user_id": current_user["user_id"],
        }
        for r in readings
    ]

    try:
        response = supabase.table("npk_history").insert(records).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk insert readings: {str(e)}",
        )

    # Update in-memory caches using the last item in the list
    last_item = readings[-1]
    latest_reading.update(
        {
            "nitrogen": last_item.nitrogen_n,
            "phosphorous": last_item.phosphorus_p,
            "potassium": last_item.potassium_k,
            "device_id": last_item.module_id,
            "plant_id": last_item.plant_id,
            "user_id": current_user["user_id"],
        }
    )
    latest_readings_by_plant[last_item.plant_id] = {
        "nitrogen": last_item.nitrogen_n,
        "phosphorous": last_item.phosphorus_p,
        "potassium": last_item.potassium_k,
        "device_id": last_item.module_id,
        "plant_id": last_item.plant_id,
        "user_id": current_user["user_id"],
    }

    return {
        "status": "success",
        "inserted_count": len(response.data) if response.data else len(records),
        "data": response.data,
    }


@router.post("/npk-reading", status_code=status.HTTP_200_OK)
@router.post("/reading", status_code=status.HTTP_200_OK)
def receive_npk_reading(
    reading: NPKReading,
    plant_id: Optional[str] = None,
):
    """
    ESP32 / Sensor posts live NPK readings here.
    Updates the in-memory store and logs to npk_history if plant_id or user_id is present.
    """
    data = reading.model_dump() if hasattr(reading, "model_dump") else reading.dict()

    target_plant_id = plant_id or data.get("plant_id") or latest_reading.get("plant_id")
    target_user_id = data.get("user_id") or latest_reading.get("user_id")
    device_id = data.get("device_id") or "esp32-npk-01"
    valid_module_id = device_id

    if not target_user_id or not target_plant_id:
        try:
            plant_res = (
                supabase.table("plants")
                .select("plant_id, user_id")
                .is_("deleted_at", "null")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if plant_res.data:
                target_plant_id = target_plant_id or plant_res.data[0].get("plant_id")
                target_user_id = target_user_id or plant_res.data[0].get("user_id")

            mod_res = (
                supabase.table("sensor_module").select("module_id").limit(1).execute()
            )
            if mod_res.data:
                valid_module_id = mod_res.data[0].get("module_id")
        except Exception as e:
            print(f"[NPK Router] Auto plant lookup notice: {e}")

    latest_reading.update(
        {
            "nitrogen": data["nitrogen"],
            "phosphorous": data["phosphorous"],
            "potassium": data["potassium"],
            "device_id": device_id,
            "plant_id": target_plant_id,
            "user_id": target_user_id,
        }
    )

    if target_plant_id:
        latest_readings_by_plant[target_plant_id] = {
            "nitrogen": data["nitrogen"],
            "phosphorous": data["phosphorous"],
            "potassium": data["potassium"],
            "device_id": device_id,
            "plant_id": target_plant_id,
            "user_id": target_user_id,
        }

        try:
            effective_module_id = device_id
            try:
                supabase.table("sensor_module").upsert(
                    {
                        "module_id": device_id,
                        "device_name": "ESP32 NPK Sensor",
                        "user_id": target_user_id,
                        "is_active": True,
                    }
                ).execute()
            except Exception:
                effective_module_id = valid_module_id

            payload = {
                "nitrogen_n": data["nitrogen"],
                "phosphorus_p": data["phosphorous"],
                "potassium_k": data["potassium"],
                "plant_id": target_plant_id,
                "module_id": effective_module_id,
            }
            if target_user_id:
                payload["user_id"] = target_user_id

            res = supabase.table("npk_history").insert(payload).execute()
            print(
                f"[NPK Router] Successfully logged NPK reading to database: {res.data}"
            )
        except Exception as e:
            print(f"[NPK Router] Database insert error: {e}")

    print(f"Received NPK reading: {data}")
    return {"status": "ok", "received": data, "saved_to_db": bool(target_plant_id)}


@router.get("/npk-reading/latest", status_code=status.HTTP_200_OK)
@router.get("/latest", status_code=status.HTTP_200_OK)
def get_latest_reading(plant_id: Optional[str] = None):
    """
    Fetch the most recent NPK reading (in-memory or plant-specific).
    """
    return get_latest_npk_data(plant_id=plant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_npk_reading(
    reading: NPKCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Store a single NPK sensor reading for a specific plant.
    """
    response = (
        supabase.table("npk_history")
        .insert(
            {
                "nitrogen_n": reading.nitrogen_n,
                "phosphorus_p": reading.phosphorus_p,
                "potassium_k": reading.potassium_k,
                "plant_id": reading.plant_id,
                "module_id": reading.module_id,
                "time_slot": reading.time_slot,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=500,
            detail="Failed to log reading.",
        )

    # Update in-memory cache
    latest_reading.update(
        {
            "nitrogen": reading.nitrogen_n,
            "phosphorous": reading.phosphorus_p,
            "potassium": reading.potassium_k,
            "device_id": reading.module_id,
            "plant_id": reading.plant_id,
            "user_id": current_user["user_id"],
        }
    )
    latest_readings_by_plant[reading.plant_id] = {
        "nitrogen": reading.nitrogen_n,
        "phosphorous": reading.phosphorus_p,
        "potassium": reading.potassium_k,
        "device_id": reading.module_id,
        "plant_id": reading.plant_id,
        "user_id": current_user["user_id"],
    }

    return response.data[0]


@router.get("/plant/{plant_id}/latest", status_code=status.HTTP_200_OK)
def get_latest_npk_reading(
    plant_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get the latest NPK reading for a specific plant
    belonging to the authenticated user.
    """
    return get_latest_npk_data(plant_id=plant_id, user_id=current_user["user_id"])


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_npk_readings_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 90,
    current_user: dict = Depends(get_current_user),
):
    start = (page - 1) * limit
    end = start + limit - 1

    query = supabase.table("npk_history").select("*", count="exact").eq("plant_id", plant_id)
    
    # Only filter by user_id if the caller is not an admin
    if current_user.get("role") != "admin":
        query = query.eq("user_id", current_user["user_id"])

    response = query.order("created_at", desc=True).range(start, end).execute()

    return {
        "data": response.data,
        "total": response.count if response.count is not None else len(response.data),
        "page": page,
        "limit": limit,
    }


@router.get("", status_code=status.HTTP_200_OK)
def get_all_npk_readings(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """
    View recent NPK history records belonging to
    the authenticated user.
    """
    if limit < 1:
        raise HTTPException(
            status_code=400,
            detail="Limit must be greater than 0.",
        )

    response = (
        supabase.table("npk_history")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return response.data