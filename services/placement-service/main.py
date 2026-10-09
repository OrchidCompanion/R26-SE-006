from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, status, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    create_location,
    get_user_locations,
    get_location_by_id,
    soft_delete_location,
    register_module,
    get_user_modules,
    save_analysis_record,
    get_user_analysis_history,
)
from mqtt_hub import (
    start_mqtt_hub,
    get_latest_sensor_data,
    get_sensor_module_status,
)
from placement_evaluator import evaluate_placement

app = FastAPI(
    title="Orchid Plant Placement Analysis Service",
    description="Microservice for environmental location testing, sensor module pairing, and orchid microclimate suitability evaluation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    start_mqtt_hub()
    print("[PlacementService] Initialized with background MQTT listener.")


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "service": "Orchid Plant Placement Analysis Service",
        "status": "healthy",
        "mqtt_enabled": True,
    }


# ==============================================================================
# SENSOR MODULE PAIRING ENDPOINTS
# ==============================================================================

class ModuleRegisterRequest(BaseModel):
    module_id: str
    device_name: Optional[str] = "ESP32 S3 Node"
    user_id: Optional[str] = None
    location_id: Optional[str] = None

@app.post("/modules", status_code=status.HTTP_201_CREATED, tags=["Hardware Modules"])
@app.post("/api/sensors/modules", status_code=status.HTTP_201_CREATED, tags=["Hardware Modules"])
def register_sensor_module(
    data: ModuleRegisterRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Registers / pairs an ESP32 S3 hardware node."""
    effective_user_id = data.user_id or x_user_id or "anonymous"
    module = register_module(
        module_id=data.module_id,
        device_name=data.device_name,
        user_id=effective_user_id,
        location_id=data.location_id,
    )
    if not module:
        raise HTTPException(status_code=500, detail="Failed to register sensor module.")
    return module


@app.get("/modules/user/{user_id}", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/user/{user_id}", tags=["Hardware Modules"])
def list_user_modules(user_id: str):
    """Lists all paired sensor modules for a user."""
    return get_user_modules(user_id)


@app.get("/modules/{module_id}/status", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/{module_id}/status", tags=["Hardware Modules"])
def check_module_status(module_id: str):
    """Checks whether the sensor node is online and streaming."""
    return get_sensor_module_status(module_id)


@app.get("/modules/{module_id}/read-ambient", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/{module_id}/read-ambient", tags=["Hardware Modules"])
def read_ambient_telemetry(module_id: str):
    """Fetches real-time ambient telemetry (temperature, humidity, light) from cache/DB."""
    return get_latest_sensor_data(module_id)


# ==============================================================================
# LOCATION ZONES CRUD ENDPOINTS
# ==============================================================================

class LocationCreate(BaseModel):
    location_name: str
    description: Optional[str] = None
    user_id: Optional[str] = None

@app.post("/locations", status_code=status.HTTP_201_CREATED, tags=["Locations"])
@app.post("/api/locations", status_code=status.HTTP_201_CREATED, tags=["Locations"])
def add_location(
    data: LocationCreate,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = data.user_id or x_user_id or "anonymous"
    loc = create_location(name=data.location_name, description=data.description, user_id=effective_user_id)
    if not loc:
        raise HTTPException(status_code=500, detail="Failed to create location.")
    return loc


@app.get("/locations", tags=["Locations"])
@app.get("/api/locations", tags=["Locations"])
def list_locations(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id query param or X-User-Id header required.")
    return get_user_locations(effective_user_id)


@app.get("/locations/{location_id}", tags=["Locations"])
@app.get("/api/locations/{location_id}", tags=["Locations"])
def get_location(location_id: str):
    loc = get_location_by_id(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found.")
    return loc


@app.delete("/locations/{location_id}", tags=["Locations"])
@app.delete("/api/locations/{location_id}", tags=["Locations"])
def remove_location(location_id: str):
    ok = soft_delete_location(location_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Location not found or already deleted.")
    return {"message": "Location deleted successfully."}


# ==============================================================================
# PLACEMENT ANALYSIS EVALUATION
# ==============================================================================

class PlacementEvaluateRequest(BaseModel):
    species: Optional[str] = "Dendrobium"
    module_id: Optional[str] = None
    user_id: Optional[str] = None
    readings: Optional[List[Dict[str, float]]] = None

@app.post("/evaluate", tags=["Placement Analysis"])
@app.post("/api/locations/evaluate", tags=["Placement Analysis"])
def evaluate_orchid_placement(
    data: PlacementEvaluateRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Evaluates 60-second microclimate samples against orchid environmental criteria.
    If samples are not passed, fetches live telemetry for the module automatically.
    """
    effective_user_id = data.user_id or x_user_id or "anonymous"
    readings = data.readings

    if not readings and data.module_id:
        live = get_latest_sensor_data(data.module_id)
        readings = [{
            "temp": float(live.get("temperature", 27.5)),
            "hum": float(live.get("humidity", 72.0)),
            "lux": float(live.get("lux", 20000.0)),
        }]

    evaluation = evaluate_placement(species=data.species, readings=readings)

    # Save evaluation test record in Supabase
    save_analysis_record({
        "user_id": effective_user_id,
        "module_id": data.module_id,
        "species": data.species,
        "readings": readings,
        "averages": evaluation["averages"],
        "verdict": evaluation["verdict"],
        "recommendation": evaluation["recommendation"],
    })

    return evaluation


@app.get("/history", tags=["Placement Analysis"])
def get_placement_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id query param or X-User-Id header required.")
    return get_user_analysis_history(effective_user_id)
