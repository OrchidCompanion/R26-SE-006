from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user

class ModuleCreate(BaseModel):
    module_name: str

class ModuleUpdate(BaseModel):
    module_name: Optional[str] = None

router = APIRouter(
    prefix="/api/sensors/modules",
    tags=["Sensor Modules"]
)

@router.post("", status_code=status.HTTP_201_CREATED)
def create_sensor_module(module: ModuleCreate, current_user: dict = Depends(get_current_user)):
    """Register a new hardware sensor module."""
    response = supabase.table("sensor_module").insert({
        "module_name": module.module_name,
        "user_id": current_user["user_id"]
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to register sensor module.")

    return response.data[0]


@router.get("")
def get_all_sensor_modules(current_user: dict = Depends(get_current_user)):
    """View all active sensor modules for current user."""
    response = supabase.table("sensor_module").select("*").eq("user_id", current_user["user_id"]).is_("deleted_at", "null").execute()
    return response.data


@router.get("/{module_id}")
def get_sensor_module_by_id(module_id: str, current_user: dict = Depends(get_current_user)):
    """Get sensor module by ID."""
    response = supabase.table("sensor_module").select("*").eq("module_id", module_id).eq("user_id", current_user["user_id"]).is_("deleted_at", "null").execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")
    return response.data[0]


@router.put("/{module_id}")
def update_sensor_module(module_id: str, module_data: ModuleUpdate, current_user: dict = Depends(get_current_user)):
    """Update sensor module details."""
    update_fields = {k: v for k, v in module_data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    response = supabase.table("sensor_module").update(update_fields).eq("module_id", module_id).eq("user_id", current_user["user_id"]).is_("deleted_at", "null").execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")

    return response.data[0]


@router.delete("/{module_id}")
def soft_delete_sensor_module(module_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a sensor module."""
    response = supabase.table("sensor_module").update({
        "deleted_at": datetime.now(timezone.utc).isoformat()
    }).eq("module_id", module_id).eq("user_id", current_user["user_id"]).is_("deleted_at", "null").execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")

    return {"message": "Sensor module soft deleted successfully."}