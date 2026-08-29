from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class LocationCreate(BaseModel):
    location_name: str
    description: Optional[str] = None
    user_id: Optional[str] = None


class LocationUpdate(BaseModel):
    location_name: Optional[str] = None
    description: Optional[str] = None


router = APIRouter(prefix="/api/locations", tags=["Locations"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_location(
    data: LocationCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new location/zone."""
    target_user_id = (
        data.user_id
        if (data.user_id and current_user.get("role") == "admin")
        else current_user["user_id"]
    )

    response = (
        supabase.table("locations")
        .insert(
            {
                "location_name": data.location_name,
                "description": data.description,
                "user_id": target_user_id,
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create location.")

    return response.data[0]


@router.get("")
def get_my_locations(current_user: dict = Depends(get_current_user)):
    """Get all locations for current logged-in user."""
    response = (
        supabase.table("locations")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@router.get("/user/{user_id}")
def get_locations_by_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Admin / User: Get all locations belonging to a specific user."""
    response = (
        supabase.table("locations")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@router.get("/{location_id}")
def get_location_by_id(
    location_id: str, current_user: dict = Depends(get_current_user)
):
    """Get single location by ID."""
    response = (
        supabase.table("locations").select("*").eq("location_id", location_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Location not found.")
    return response.data[0]


@router.put("/{location_id}")
def update_location(
    location_id: str,
    data: LocationUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update location details."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    response = (
        supabase.table("locations")
        .update(update_fields)
        .eq("location_id", location_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=404, detail="Location not found or update failed."
        )

    return response.data[0]


@router.delete("/{location_id}")
def delete_location(location_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a location."""
    response = (
        supabase.table("locations").delete().eq("location_id", location_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Location not found.")

    return {"message": "Location deleted successfully."}
