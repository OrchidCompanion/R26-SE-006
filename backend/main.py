import os
from enum import Enum
from typing import Optional, List
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase URL or Key in environment variables.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(
    title="OrchidCompanion API",
    description="API for React Web, React Native, and ESP32 orchid management system.",
    version="1.0.0"
)

# Enable CORS for React Web, Mobile App, and ESP32 HTTP requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Enums for Validation ---
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
    status: StatusEnum = StatusEnum.active


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[SpeciesEnum] = None
    location: Optional[str] = None
    status: Optional[StatusEnum] = None


# --- Endpoints ---
@app.get("/api/health", tags=["Health Check"])
def health_check():
    """Health check endpoint to verify backend connectivity."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/plants", tags=["Plants"], status_code=status.HTTP_201_CREATED)
def create_plant(plant: PlantCreate):
    """Add a new plant to the database."""
    response = supabase.table("plants").insert({
        "name": plant.name,
        "species": plant.species.value,
        "location": plant.location,
        "status": plant.status.value
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to add plant.")
    
    return response.data[0]


@app.get("/api/plants", tags=["Plants"])
def get_all_plants(include_inactive: bool = False):
    """View all plants. Filters out soft-deleted (inactive) plants by default."""
    query = supabase.table("plants").select("*")
    
    if not include_inactive:
        query = query.eq("status", "active")
        
    response = query.execute()
    return response.data


@app.get("/api/plants/{plant_id}", tags=["Plants"])
def get_plant_by_id(plant_id: int):
    """Get specific plant details by ID."""
    response = supabase.table("plants").select("*").eq("id", plant_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")
    
    return response.data[0]


@app.put("/api/plants/{plant_id}", tags=["Plants"])
def update_plant(plant_id: int, plant_data: PlantUpdate):
    """Update plant details."""
    update_fields = {k: v.value if isinstance(v, Enum) else v 
                     for k, v in plant_data.model_dump().items() if v is not None}
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    response = supabase.table("plants").update(update_fields).eq("id", plant_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")
    
    return response.data[0]


@app.delete("/api/plants/{plant_id}", tags=["Plants"])
def soft_delete_plant(plant_id: int):
    """Soft delete a plant by changing its status to 'inactive'."""
    response = supabase.table("plants").update({"status": StatusEnum.inactive.value}).eq("id", plant_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Plant with ID {plant_id} not found.")
    
    return {"message": f"Plant {plant_id} marked as inactive successfully."}