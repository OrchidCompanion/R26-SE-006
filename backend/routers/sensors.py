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
        self.active_connections: Dict[str, WebSocket] = {}
        self.pending_requests: Dict[str, asyncio.Future] = {}

    def normalize_mac(self, mac: str) -> str:
        return mac.replace(":", "").replace("-", "").strip().lower()

    async def connect(self, module_id: str, websocket: WebSocket):
        await websocket.accept()
        clean_id = self.normalize_mac(module_id)
        self.active_connections[clean_id] = websocket

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
        clean_id = self.normalize_mac(module_id)

        if not self.is_online(clean_id):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"ESP32 module ({clean_id}) is offline or powered off.",
            )

        ws = self.active_connections[clean_id]
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_requests[clean_id] = future

        try:
            await ws.send_text(json.dumps(command_payload))
            response_data = await asyncio.wait_for(future, timeout=timeout_seconds)
            return response_data
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="ESP32 failed to respond within timeout window.",
            )
        finally:
            self.pending_requests.pop(clean_id, None)

    def handle_incoming_message(self, module_id: str, message_text: str):
        clean_id = self.normalize_mac(module_id)
        try:
            data = json.loads(message_text)

            if clean_id in self.pending_requests:
                future = self.pending_requests[clean_id]
                if not future.done():
                    future.set_result(data)

            supabase.table("sensor_module").update(
                {"last_seen": datetime.now(timezone.utc).isoformat()}
            ).eq("module_id", clean_id).execute()

        except json.JSONDecodeError:
            print(f"[WS Manager] Invalid JSON received from {clean_id}: {message_text}")
        except Exception as e:
            print(f"[WS Manager] Error processing message from {clean_id}: {e}")


manager = ESP32ConnectionManager()

router = APIRouter(prefix="/api/sensors", tags=["Sensor Hardware Control & Modules"])


# WebSocket Endpoint for ESP32 Nodes
@router.websocket("/ws/{module_id}")
async def websocket_esp32_endpoint(websocket: WebSocket, module_id: str):
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


# Diagnostics & Status Check
@router.get("/modules/{module_id}/status")
async def check_sensor_module_status(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module_id)

    if not manager.is_online(clean_id):
        return {
            "online": False,
            "dht11": False,
            "bh1750": False,
            "msg": "ESP32 is offline or powered off.",
        }

    try:
        result = await manager.send_command_and_wait(
            clean_id, {"action": "health_check"}, timeout_seconds=5.0
        )
        return {
            "online": True,
            "dht11": result.get("dht11_ok", False),
            "bh1750": result.get("bh1750_ok", False),
            "msg": "Sensors operational.",
        }
    except HTTPException as e:
        return {"online": False, "dht11": False, "bh1750": False, "msg": e.detail}


# Live Ambient Burst Read (DHT11 & BH1750)
@router.get("/modules/{module_id}/read-ambient")
async def trigger_live_ambient_read(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module_id)

    response = await manager.send_command_and_wait(
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

    if temp is None or hum is None or lux is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Incomplete telemetry received from ESP32.",
        )

    return {
        "temperature": float(temp),
        "humidity": float(hum),
        "lux": float(lux),
        "module_id": clean_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Live NPK Sensor Read
@router.get("/modules/{module_id}/read-npk")
async def trigger_live_npk_read(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module_id)

    response = await manager.send_command_and_wait(
        clean_id, {"action": "read_npk"}, timeout_seconds=6.0
    )

    if response.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=response.get("error", "NPK sensor read failure."),
        )

    n = response.get("nitrogen_n", response.get("nitrogen"))
    p = response.get("phosphorus_p", response.get("phosphorus"))
    k = response.get("potassium_k", response.get("potassium"))

    if n is None or p is None or k is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Incomplete NPK telemetry received.",
        )

    return {
        "nitrogen_n": float(n),
        "phosphorus_p": float(p),
        "potassium_k": float(k),
        "module_id": clean_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Module Registration & CRUD
@router.post("/modules", status_code=status.HTTP_201_CREATED)
def register_sensor_module(
    module: ModuleCreate, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module.module_id)
    target_user_id = module.user_id if module.user_id else current_user["user_id"]

    existing = (
        supabase.table("sensor_module").select("*").eq("module_id", clean_id).execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Module with MAC '{clean_id}' is already registered.",
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
        raise HTTPException(status_code=500, detail="Failed to save module.")

    return res.data[0]


@router.get("/modules/user/{user_id}")
def get_sensor_modules_for_user(
    user_id: str, current_user: dict = Depends(get_current_user)
):
    res = (
        supabase.table("sensor_module")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    modules_with_status = []
    for mod in res.data:
        clean_id = manager.normalize_mac(mod["module_id"])
        mod["is_online"] = manager.is_online(clean_id)
        modules_with_status.append(mod)

    return modules_with_status


@router.delete("/modules/{module_id}")
def delete_sensor_module(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module_id)
    res = supabase.table("sensor_module").delete().eq("module_id", clean_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Module not found.")
    return {"message": "Module removed successfully."}


# Diagnostics & Status Check
@router.get("/modules/{module_id}/status")
async def check_sensor_module_status(
    module_id: str, current_user: dict = Depends(get_current_user)
):
    clean_id = manager.normalize_mac(module_id)

    if not manager.is_online(clean_id):
        return {
            "online": False,
            "device": "Offline",
            "npk": False,
            "dht11": False,
            "bh1750": False,
            "msg": "ESP32 is offline or powered off.",
        }

    try:
        result = await manager.send_command_and_wait(
            clean_id, {"action": "health_check"}, timeout_seconds=5.0
        )
        is_npk = result.get("device") == "NPK_Node" or "npk_ok" in result

        return {
            "online": True,
            "device": result.get("device", "Ambient_Node"),
            "npk": is_npk or result.get("npk_ok", False),
            "dht11": result.get("dht11_ok", False),
            "bh1750": result.get("bh1750_ok", False),
            "msg": "Sensor module operational.",
        }
    except HTTPException as e:
        return {
            "online": False,
            "device": "Error",
            "npk": False,
            "dht11": False,
            "bh1750": False,
            "msg": e.detail,
        }
