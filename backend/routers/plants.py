from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class PlantCreate(BaseModel):
    plant_name: str
    plant_species: str
    plant_location: str


class PlantUpdate(BaseModel):
    plant_name: Optional[str] = None
    plant_species: Optional[str] = None
    plant_location: Optional[str] = None


router = APIRouter(prefix="/api/plants", tags=["Plants"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_plant(plant: PlantCreate, current_user: dict = Depends(get_current_user)):
    """Create a new plant."""
    response = (
        supabase.table("plant")
        .insert(
            {
                "plant_name": plant.plant_name,
                "plant_species": plant.plant_species,
                "plant_location": plant.plant_location,
                "user_id": current_user["user_id"],
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add plant.")

    return response.data[0]


@router.get("")
def get_all_plants(current_user: dict = Depends(get_current_user)):
    """View all active plants for the current user."""
    response = (
        supabase.table("plant")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    return response.data


@router.get("/{plant_id}")
def get_plant_by_id(plant_id: str, current_user: dict = Depends(get_current_user)):
    """Get plant details by ID."""
    response = (
        supabase.table("plant")
        .select("*")
        .eq("plant_id", plant_id)
        .eq("user_id", current_user["user_id"])
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

    response = (
        supabase.table("plant")
        .update(update_fields)
        .eq("plant_id", plant_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Plant not found or update failed.")

    return response.data[0]


@router.delete("/{plant_id}")
def soft_delete_plant(plant_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a plant."""
    response = (
        supabase.table("plant")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("plant_id", plant_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Plant not found.")

    return {"message": "Plant soft deleted successfully."}


@router.get("/user/{user_id}")
def get_plants_by_user_id(user_id: str, current_user: dict = Depends(get_current_user)):
    """Admin/User: Get all active plants for a specific user."""
    res = (
        supabase.table("plant")
        .select("*")
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data
