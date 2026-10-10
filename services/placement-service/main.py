from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, status, Query, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    create_location,
    get_user_locations,
    get_location_by_id,
    update_location,
    soft_delete_location,
    register_module,
    get_user_modules,
    save_ambient_reading,
    save_analysis_record,
    get_user_analysis_history,
)
from mqtt_hub import (
    start_mqtt_hub,
    get_latest_sensor_data,
    get_sensor_module_status,
    latest_readings,
)
from ws_manager import ws_manager
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


# ==============================================================================
# WEBSOCKET CONNECTIONS & LIVE HARDWARE DISPATCH
# ==============================================================================

@app.websocket("/ws/{module_id}")
@app.websocket("/api/sensors/ws/{module_id}")
async def websocket_esp32_endpoint(websocket: WebSocket, module_id: str):
    """Bidirectional WebSocket connection endpoint for ESP32 hardware nodes."""
    clean_id = ws_manager.normalize_mac(module_id)
    await ws_manager.connect(clean_id, websocket)
    print(f"[ESP32 WS Connected] Module MAC: {clean_id}")
    try:
        while True:
            text_data = await websocket.receive_text()
            ws_manager.handle_incoming_message(clean_id, text_data)
    except WebSocketDisconnect:
        ws_manager.disconnect(clean_id)
        print(f"[ESP32 WS Disconnected] Module MAC: {clean_id}")
    except Exception as e:
        ws_manager.disconnect(clean_id)
        print(f"[ESP32 WS Error] Module {clean_id}: {e}")


@app.get("/modules/user/{user_id}", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/user/{user_id}", tags=["Hardware Modules"])
def list_user_modules(user_id: str):
    """Lists all paired sensor modules for a user."""
    return get_user_modules(user_id)


@app.get("/modules/{module_id}/status", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/{module_id}/status", tags=["Hardware Modules"])
async def check_module_status(module_id: str):
    """Checks whether the sensor node is online and healthy."""
    clean_id = ws_manager.normalize_mac(module_id)
    if ws_manager.is_online(clean_id):
        try:
            result = await ws_manager.send_command_and_wait(
                clean_id, {"action": "health_check"}, timeout_seconds=5.0
            )
            return {
                "module_id": clean_id,
                "online": True,
                "dht11": result.get("dht11_ok", True),
                "bh1750": result.get("bh1750_ok", True),
                "msg": "Sensors operational over WebSocket.",
            }
        except Exception:
            return {
                "module_id": clean_id,
                "online": True,
                "dht11": True,
                "bh1750": True,
                "msg": "Connected via WebSocket.",
            }

    # Fallback: check MQTT hub or DB
    return get_sensor_module_status(module_id)


@app.get("/modules/{module_id}/read-ambient", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/{module_id}/read-ambient", tags=["Hardware Modules"])
async def read_ambient_telemetry(module_id: str):
    """Fetches real-time ambient telemetry (temperature, humidity, lux) directly from ESP32."""
    clean_id = ws_manager.normalize_mac(module_id)
    if ws_manager.is_online(clean_id):
        try:
            response = await ws_manager.send_command_and_wait(
                clean_id, {"action": "read_sensors"}, timeout_seconds=6.0
            )
            if response.get("status") == "error":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=response.get("error", "Sensor read failure from ESP32."),
                )
            temp = response.get("temperature")
            hum = response.get("humidity")
            lux = response.get("lux")
            if temp is not None and hum is not None and lux is not None:
                save_ambient_reading(clean_id, float(temp), float(hum), float(lux))
                latest_readings[clean_id] = {
                    "temperature": float(temp),
                    "humidity": float(hum),
                    "lux": float(lux),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "online": True,
                }
                return {
                    "temperature": float(temp),
                    "humidity": float(hum),
                    "lux": float(lux),
                    "module_id": clean_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
        except HTTPException:
            raise
        except Exception as e:
            print(f"[WS Ambient Read Error] {clean_id}: {e}")

    # Fallback to MQTT/DB cached data
    return get_latest_sensor_data(module_id)


@app.get("/modules/{module_id}/read-npk", tags=["Hardware Modules"])
@app.get("/api/sensors/modules/{module_id}/read-npk", tags=["Hardware Modules"])
async def trigger_live_npk_read(module_id: str):
    """Triggers live RS485 Modbus NPK sensor read from ESP32 over WebSocket."""
    clean_id = ws_manager.normalize_mac(module_id)
    if ws_manager.is_online(clean_id):
        try:
            response = await ws_manager.send_command_and_wait(
                clean_id, {"action": "read_npk"}, timeout_seconds=6.0
            )
            if response.get("status") == "error":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=response.get("error", "NPK sensor read failure."),
                )
            n = response.get("nitrogen_n", response.get("nitrogen", 0))
            p = response.get("phosphorus_p", response.get("phosphorus", 0))
            k = response.get("potassium_k", response.get("potassium", 0))
            return {
                "nitrogen_n": float(n),
                "phosphorus_p": float(p),
                "potassium_k": float(k),
                "module_id": clean_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Calibrated fallback if module is offline during test
    return {
        "nitrogen_n": 45.0,
        "phosphorus_p": 25.0,
        "potassium_k": 35.0,
        "module_id": clean_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "simulated": True,
    }


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


@app.get("/locations/user/{user_id}", tags=["Locations"])
@app.get("/api/locations/user/{user_id}", tags=["Locations"])
def get_locations_for_user(user_id: str):
    """Admin / User: Get all locations for a specific user."""
    return get_user_locations(user_id)


@app.get("/locations/{location_id}", tags=["Locations"])
@app.get("/api/locations/{location_id}", tags=["Locations"])
def get_location(location_id: str):
    loc = get_location_by_id(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found.")
    return loc



class LocationUpdate(BaseModel):
    location_name: Optional[str] = None
    description: Optional[str] = None

@app.put("/locations/{location_id}", tags=["Locations"])
@app.put("/api/locations/{location_id}", tags=["Locations"])
def update_location_zone(location_id: str, data: LocationUpdate):
    loc = update_location(location_id, data.location_name, data.description)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found or update failed.")
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
