from enum import Enum
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from database import supabase


# --- Enums ---
class SpeciesEnum(str, Enum):
    oncidium = "oncidium"
    phalaenopsis = "phalaenopsis"
    dendrobium = "dendrobium"


class StatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"


# --- Pydantic Data Models ---
class PlantCreate(BaseModel):
    name: str
    species: SpeciesEnum
    location: str
    user_id: Optional[str] = None
    status: StatusEnum = StatusEnum.active


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[SpeciesEnum] = None
    location: Optional[str] = None
    user_id: Optional[str] = None
    status: Optional[StatusEnum] = None


# --- Router Initialization ---
router = APIRouter(
    prefix="/api/plants",
    tags=["Plants"]
)


# --- Endpoints ---

@router.post("", status_code=status.HTTP_201_CREATED)
def create_plant(plant: PlantCreate):
    """Add a new plant to the database."""
    response = supabase.table("plants").insert({
        "name": plant.name,
        "species": plant.species.value,
        "location": plant.location,
        "user_id": plant.user_id,
        "status": plant.status.value
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add plant.")

    return response.data[0]


@router.get("")
def get_all_plants(include_inactive: bool = False):
    """View all plants. Filters out soft-deleted (inactive) plants by default."""
    query = supabase.table("plants").select("*")
    if not include_inactive:
        query = query.eq("status", "active")
    response = query.execute()
    return response.data


@router.get("/{plant_id}")
def get_plant_by_id(plant_id: int):
    """Get specific plant details by ID."""
    response = supabase.table("plants").select("*").eq("id", plant_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")
    return response.data[0]


@router.put("/{plant_id}")
def update_plant(plant_id: int, plant_data: PlantUpdate):
    """Update plant details."""
    update_fields = {
        k: v.value if isinstance(v, Enum) else v
        for k, v in plant_data.model_dump().items()
        if v is not None
    }

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    response = supabase.table("plants").update(update_fields).eq("id", plant_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")

    return response.data[0]


@router.delete("/{plant_id}")
def soft_delete_plant(plant_id: int):
    """Soft delete a plant by changing its status to 'inactive'."""
    response = (
        supabase.table("plants")
        .update({"status": StatusEnum.inactive.value})
        .eq("id", plant_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")

    return {"message": f"Plant {plant_id} marked as inactive successfully."}