import asyncio
import json
from datetime import datetime, timezone
from typing import Optional, Dict
from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


class ModuleCreate(BaseModel):
    module_id: str  # Hardware MAC address
    device_name: Optional[str] = "ESP32 S3 Sensor"
    user_id: Optional[str] = None


class ModuleUpdate(BaseModel):
    device_name: Optional[str] = None
    is_active: Optional[bool] = None


class ESP32ConnectionManager:
    def __init__(self):
        # Maps normalized module_id (mac string) -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}

        # Stores pending futures waiting for responses: {module_id: asyncio.Future}
        self.pending_requests: Dict[str, asyncio.Future] = {}

    def normalize_mac(self, mac: str) -> str:
        """Strip colons, dashes and lowercase MAC address for consistent lookup."""
        return mac.replace(":", "").replace("-", "").strip().lower()

    async def connect(self, module_id: str, websocket: WebSocket):
        await websocket.accept()
        clean_id = self.normalize_mac(module_id)
        self.active_connections[clean_id] = websocket

        # Update last_seen in Supabase
        try:
            supabase.table("sensor_module").update(
                {"last_seen": datetime.now(timezone.utc).isoformat()}
            ).eq("module_id", clean_id).execute()
        except Exception as e:
            print(f"[WS Manager] Failed to update last_seen for {clean_id}: {e}")

    def disconnect(self, module_id: str):
        clean_id = self.normalize_mac(module_id)
        if clean_id in self.active_connections:
            del self.active_connections[clean_id]

        # If pending request waiting, fail it immediately
        if clean_id in self.pending_requests:
            future = self.pending_requests.pop(clean_id)
            if not future.done():
                future.set_exception(
                    HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="ESP32 disconnected abruptly while fulfilling request.",
                    )
                )

    def is_online(self, module_id: str) -> bool:
        clean_id = self.normalize_mac(module_id)
        return clean_id in self.active_connections

    async def send_command_and_wait(
        self, module_id: str, command_payload: dict, timeout_seconds: float = 6.0
    ) -> dict:
        """
        Sends an action command to the ESP32 over WebSocket and awaits its response.
        Raises HTTPException if offline, timeout, or sensor read failure occurs.
        """
        clean_id = self.normalize_mac(module_id)

        if not self.is_online(clean_id):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"ESP32 module ({clean_id}) is offline or powered off. Ensure device is powered on and connected to Wi-Fi.",
            )

        ws = self.active_connections[clean_id]
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_requests[clean_id] = future

        try:
            # Send action command to ESP32
            await ws.send_text(json.dumps(command_payload))

            # Wait for the ESP32 to reply with data within timeout window
            response_data = await asyncio.wait_for(future, timeout=timeout_seconds)
            return response_data

        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="ESP32 failed to respond within 6 seconds. Check device Wi-Fi signal quality.",
            )
        finally:
            self.pending_requests.pop(clean_id, None)

    def handle_incoming_message(self, module_id: str, message_text: str):
        """Processes JSON messages received from ESP32."""
        clean_id = self.normalize_mac(module_id)
        try:
            data = json.loads(message_text)

            # If this message is a response to an ongoing HTTP request, resolve future
            if clean_id in self.pending_requests:
                future = self.pending_requests[clean_id]
                if not future.done():
                    future.set_result(data)

            # Update last_seen timestamp in database
            supabase.table("sensor_module").update(
                {"last_seen": datetime.now(timezone.utc).isoformat()}
            ).eq("module_id", clean_id).execute()

        except json.JSONDecodeError:
            print(f"[WS Manager] Invalid JSON received from {clean_id}: {message_text}")
        except Exception as e:
            print(f"[WS Manager] Error processing message from {clean_id}: {e}")


manager = ESP32ConnectionManager()

# API ROUTER
router = APIRouter(prefix="/api/sensors", tags=["Sensor Hardware Control & Modules"])


# ESP32 WEBSOCKET ENDPOINT (Target URL for ESP32)
@router.websocket("/ws/{module_id}")
async def websocket_esp32_endpoint(websocket: WebSocket, module_id: str):
    """
    WebSocket channel for ESP32 S3 hardware nodes.
    Connect here from ESP32: ws://<SERVER_IP>:8000/api/sensors/ws/<MAC_ADDRESS>
    """
    clean_id = manager.normalize_mac(module_id)
    await manager.connect(clean_id, websocket)
    print(f"[ESP32 Connected] Module MAC: {clean_id}")

    try:
        while True:
            text_data = await websocket.receive_text()
            manager.handle_incoming_message(clean_id, text_data)
    except WebSocketDisconnect:
        manager.disconnect(clean_id)
        print(f"[ESP32 Disconnected] Module MAC: {clean_id}")
    except Exception as e:
        manager.disconnect(clean_id)
        print(f"[ESP32 Error] Module {clean_id}: {e}")


# 2. HARDWARE STATUS & LIVE AMBIENT READINGS
@router.get("/modules/{module_id}/status")
async def check_sensor_module_status(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Pings the ESP32 S3 to verify:
    1. Is the board powered on and connected over Wi-Fi?
    2. Is the DHT11 sensor functioning?
    3. Is the BH1750 light sensor functioning?
    """
    clean_id = manager.normalize_mac(module_id)

    # Check if ESP32 socket is open
    if not manager.is_online(clean_id):
        return {
            "online": False,
            "dht11": False,
            "bh1750": False,
            "msg": "ESP32 is offline or powered off. Check Wi-Fi and power source.",
        }

    # Ask ESP32 to self-test its attached sensors
    try:
        result = await manager.send_command_and_wait(
            clean_id, {"action": "health_check"}, timeout_seconds=5.0
        )

        dht11_ok = result.get("dht11_ok", False)
        bh1750_ok = result.get("bh1750_ok", False)

        issues = []
        if not dht11_ok:
            issues.append("DHT11 sensor error/disconnected")
        if not bh1750_ok:
            issues.append("BH1750 sensor error/disconnected")

        msg = (
            "All sensors operational."
            if not issues
            else f"Hardware issue: {', '.join(issues)}."
        )

        return {"online": True, "dht11": dht11_ok, "bh1750": bh1750_ok, "msg": msg}

    except HTTPException as e:
        return {"online": False, "dht11": False, "bh1750": False, "msg": e.detail}


@router.get("/modules/{module_id}/read-ambient")
async def trigger_live_ambient_read(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Triggers ESP32 S3 to take an immediate live reading from DHT11 & BH1750.
    Returns: { "temperature": float, "humidity": float, "lux": float }
    """
    clean_id = manager.normalize_mac(module_id)

    # Dispatch 'read_sensors' command to ESP32
    response = await manager.send_command_and_wait(
        clean_id, {"action": "read_sensors"}, timeout_seconds=6.0
    )

    # Handle sensor hardware errors returned by the ESP32 firmware
    if response.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=response.get("error", "ESP32 reported a sensor read failure."),
        )

    # Verify sensor values exist
    temp = response.get("temperature")
    hum = response.get("humidity")
    lux = response.get("lux")

    if temp is None or hum is None or lux is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Incomplete sensor telemetry received from ESP32.",
        )

    return {
        "temperature": float(temp),
        "humidity": float(hum),
        "lux": float(lux),
        "module_id": clean_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# 3. MODULE CRUD & REGISTRATION (MAC Address Management)
@router.post("/modules", status_code=status.HTTP_201_CREATED)
def register_sensor_module(
    module: ModuleCreate, current_user: dict = Depends(get_current_user)
):
    """Register a new ESP32 module using its hardware MAC address."""
    clean_id = manager.normalize_mac(module.module_id)
    target_user_id = module.user_id if module.user_id else current_user["user_id"]

    # Check if module MAC is already registered
    existing = (
        supabase.table("sensor_module").select("*").eq("module_id", clean_id).execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Module with MAC '{clean_id}' is already registered in the system.",
        )

    res = (
        supabase.table("sensor_module")
        .insert(
            {
                "module_id": clean_id,
                "device_name": module.device_name or "ESP32 S3 Sensor",
                "user_id": target_user_id,
                "is_active": True,
            }
        )
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save sensor module.")

    return res.data[0]


@router.get("/modules/user/{user_id}")
def get_sensor_modules_for_user(
    user_id: str, current_user: dict = Depends(get_current_user)
):
    """Fetch all registered ESP32 modules belonging to a specific user."""
    res = (
        supabase.table("sensor_module")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Annotate live online status for the UI
    modules_with_status = []
    for mod in res.data:
        clean_id = manager.normalize_mac(mod["module_id"])
        mod["is_online"] = manager.is_online(clean_id)
        modules_with_status.append(mod)

    return modules_with_status


@router.get("/modules/{module_id}")
def get_sensor_module_by_id(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    """Get details of a single module."""
    clean_id = manager.normalize_mac(module_id)
    res = (
        supabase.table("sensor_module").select("*").eq("module_id", clean_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")

    mod = res.data[0]
    mod["is_online"] = manager.is_online(clean_id)
    return mod


@router.put("/modules/{module_id}")
def update_sensor_module(
    module_id: str, data: ModuleUpdate, current_user: dict = Depends(get_current_user)
):
    """Update label or active state of a module."""
    clean_id = manager.normalize_mac(module_id)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided.")

    res = (
        supabase.table("sensor_module")
        .update(updates)
        .eq("module_id", clean_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")
    return res.data[0]


@router.delete("/modules/{module_id}")
def delete_sensor_module(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    """Remove a sensor module."""
    clean_id = manager.normalize_mac(module_id)
    res = supabase.table("sensor_module").delete().eq("module_id", clean_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Sensor module not found.")
    return {"message": "Module removed successfully."}
