import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect, HTTPException, status

from database import get_db, update_module_last_seen, save_ambient_reading


class ESP32ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.pending_requests: Dict[str, asyncio.Future] = {}

    def normalize_mac(self, mac: str) -> str:
        if not mac:
            return ""
        return mac.replace(":", "").replace("-", "").strip().lower()

    async def connect(self, module_id: str, websocket: WebSocket):
        await websocket.accept()
        clean_id = self.normalize_mac(module_id)
        self.active_connections[clean_id] = websocket

        # Update last_seen in PostgreSQL across both table variants
        try:
            update_module_last_seen(clean_id)
            with get_db() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            UPDATE sensor_module
                            SET last_seen = NOW(), is_active = TRUE
                            WHERE LOWER(module_id) = %s;
                            """,
                            (clean_id,),
                        )
                        conn.commit()
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

            # Resolve pending command request if waiting
            if clean_id in self.pending_requests:
                future = self.pending_requests[clean_id]
                if not future.done():
                    future.set_result(data)

            # Update last_seen in PostgreSQL
            update_module_last_seen(clean_id)
            with get_db() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            UPDATE sensor_module
                            SET last_seen = NOW()
                            WHERE LOWER(module_id) = %s;
                            """,
                            (clean_id,),
                        )
                        conn.commit()

            # Record ambient telemetry if present
            temp = data.get("temperature") or data.get("temp")
            hum = data.get("humidity") or data.get("hum")
            lux = data.get("lux") or data.get("light")
            if temp is not None and hum is not None and lux is not None:
                save_ambient_reading(clean_id, float(temp), float(hum), float(lux))
                try:
                    from mqtt_hub import latest_readings
                    latest_readings[clean_id] = {
                        "temperature": float(temp),
                        "humidity": float(hum),
                        "lux": float(lux),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "online": True,
                    }
                except Exception:
                    pass

        except json.JSONDecodeError:
            print(f"[WS Manager] Invalid JSON received from {clean_id}: {message_text}")
        except Exception as e:
            print(f"[WS Manager] Error processing message from {clean_id}: {e}")


ws_manager = ESP32ConnectionManager()
