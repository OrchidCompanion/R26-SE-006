from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class PlantCreate(BaseModel):
    plant_name: str
    plant_species: str
    plant_location: Optional[str] = None
    location_id: Optional[str] = None
    user_id: Optional[str] = None


class PlantUpdate(BaseModel):
    plant_name: Optional[str] = None
    plant_species: Optional[str] = None
    plant_location: Optional[str] = None
    location_id: Optional[str] = None


router = APIRouter(prefix="/api/plants", tags=["Plants"])

PLANTS_TABLE = "plants"


@router.post("", status_code=status.HTTP_201_CREATED)
def create_plant(plant: PlantCreate, current_user: dict = Depends(get_current_user)):
    """Create a new plant."""
    target_user = (
        plant.user_id
        if (plant.user_id and current_user.get("role") == "admin")
        else current_user["user_id"]
    )

    payload = {
        "plant_name": plant.plant_name,
        "plant_species": plant.plant_species,
        "user_id": target_user,
    }
    if plant.location_id:
        payload["location_id"] = plant.location_id
    if plant.plant_location:
        payload["plant_location"] = plant.plant_location

    try:
        response = supabase.table(PLANTS_TABLE).insert(payload).execute()
    except Exception:
        response = supabase.table("plant").insert(payload).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add plant.")

    return response.data[0]


@router.get("")
def get_all_plants(current_user: dict = Depends(get_current_user)):
    """View all active plants for current user."""
    try:
        response = (
            supabase.table(PLANTS_TABLE)
            .select("*, locations(*)")
            .eq("user_id", current_user["user_id"])
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception:
        response = (
            supabase.table("plant")
            .select("*")
            .eq("user_id", current_user["user_id"])
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    return response.data


@router.get("/user/{user_id}")
def get_plants_by_user_id(user_id: str, current_user: dict = Depends(get_current_user)):
    """Admin / User: Get all active plants for a specific user."""
    try:
        res = (
            supabase.table(PLANTS_TABLE)
            .select("*, locations(*)")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception:
        res = (
            supabase.table("plant")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    return res.data


@router.get("/location/{location_id}")
def get_plants_by_location_id(
    location_id: str, current_user: dict = Depends(get_current_user)
):
    """Get all plants grouped under a specific location/shelf."""
    try:
        res = (
            supabase.table(PLANTS_TABLE)
            .select("*")
            .eq("location_id", location_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception:
        res = (
            supabase.table("plant")
            .select("*")
            .eq("location_id", location_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
    return res.data


@router.get("/{plant_id}")
def get_plant_by_id(plant_id: str, current_user: dict = Depends(get_current_user)):
    """Get plant details by ID."""
    try:
        response = (
            supabase.table(PLANTS_TABLE)
            .select("*, locations(*)")
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        response = (
            supabase.table("plant")
            .select("*")
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )

    if not response.data:
        raise HTTPException(status_code=404, detail="Plant not found.")
    return response.data[0]


@router.put("/{plant_id}")
def update_plant(
    plant_id: str,
    plant_data: PlantUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update plant details."""
    update_fields = {k: v for k, v in plant_data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    try:
        response = (
            supabase.table(PLANTS_TABLE)
            .update(update_fields)
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        response = (
            supabase.table("plant")
            .update(update_fields)
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )

    if not response.data:
        raise HTTPException(status_code=404, detail="Plant not found or update failed.")

    return response.data[0]


@router.delete("/{plant_id}")
def soft_delete_plant(plant_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a plant."""
    try:
        response = (
            supabase.table(PLANTS_TABLE)
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        response = (
            supabase.table("plant")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .execute()
        )

    if not response.data:
        raise HTTPException(status_code=404, detail="Plant not found.")

    return {"message": "Plant soft deleted successfully."}
