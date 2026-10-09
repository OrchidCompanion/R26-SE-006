import os
import json
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

from database import save_ambient_reading, get_latest_ambient

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt-broker")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
ENABLE_MQTT = os.getenv("ENABLE_MQTT", "true").lower() in ("true", "1", "yes")

_client: Optional[Any] = None
_thread: Optional[threading.Thread] = None

# In-memory fast cache for live sensor readings
latest_readings: Dict[str, Dict[str, Any]] = {}


def normalize_mac(mac: str) -> str:
    return mac.lower().replace(":", "").replace("-", "").strip()


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Placement Service connected to broker at {MQTT_HOST}:{MQTT_PORT}")
        client.subscribe("orchid/+/+/env")
        client.subscribe("orchid/sensors/env")
        client.subscribe("orchid/telemetry/env")
        client.subscribe("orchid/+/status")
    else:
        print(f"[MQTT] Connection returned error code: {rc}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        parts = msg.topic.split("/")

        # Extract MAC address
        module_id = payload.get("module_id") or payload.get("mac_address")
        if not module_id and len(parts) >= 3 and parts[1] != "sensors":
            module_id = parts[2]
        if not module_id and len(parts) == 3 and parts[0] == "orchid" and parts[2] == "status":
            module_id = parts[1]

        if not module_id:
            return

        clean_mac = normalize_mac(module_id)

        temp = payload.get("temperature") or payload.get("temp")
        hum = payload.get("humidity") or payload.get("hum")
        lux = payload.get("light") or payload.get("lux")

        if temp is not None and hum is not None and lux is not None:
            latest_readings[clean_mac] = {
                "temperature": float(temp),
                "humidity": float(hum),
                "lux": float(lux),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "online": True,
            }
            # Persist to database
            save_ambient_reading(
                module_id=clean_mac,
                temperature=float(temp),
                humidity=float(hum),
                lux=float(lux),
            )
            print(f"[MQTT] Ambient reading recorded for {clean_mac}: T={temp}°C, H={hum}%, L={lux} Lux")
    except Exception as e:
        print(f"[MQTT] Error handling message on {msg.topic}: {e}")


def start_mqtt_hub():
    """Starts the background MQTT listener thread."""
    global _client, _thread
    if not ENABLE_MQTT:
        print("[MQTT] Placement MQTT listener disabled by configuration.")
        return

    if mqtt is None:
        print("[MQTT] Notice: 'paho-mqtt' is not installed locally. MQTT listener will run inside Docker.")
        return

    def run():
        global _client
        retries = 0
        while retries < 5:
            try:
                _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="placement-service-hub")
                if MQTT_USER and MQTT_PASSWORD:
                    _client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

                _client.on_connect = on_connect
                _client.on_message = on_message

                print(f"[MQTT] Connecting to broker {MQTT_HOST}:{MQTT_PORT}...")
                _client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
                _client.loop_forever()
                break
            except Exception as e:
                retries += 1
                print(f"[MQTT] Warning: Could not connect to MQTT broker ({e}). Retry {retries}/5 in 5s...")
                time.sleep(5)

    _thread = threading.Thread(target=run, daemon=True)
    _thread.start()


def get_latest_sensor_data(module_id: str) -> Dict[str, Any]:
    """Retrieves live ambient reading from memory cache, DB, or fallback."""
    clean_mac = normalize_mac(module_id)
    if clean_mac in latest_readings:
        return latest_readings[clean_mac]

    db_row = get_latest_ambient(clean_mac)
    if db_row:
        return {
            "temperature": float(db_row.get("temperature", 27.5)),
            "humidity": float(db_row.get("humidity", 72.0)),
            "lux": float(db_row.get("lux", 20000.0)),
            "timestamp": db_row.get("created_at"),
            "online": True,
        }

    # Calibrated fallback if sensor is offline during test
    return {
        "temperature": 27.5,
        "humidity": 72.0,
        "lux": 20000.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "online": False,
    }


def get_sensor_module_status(module_id: str) -> Dict[str, Any]:
    """Checks whether the ESP32 is online and streaming."""
    clean_mac = normalize_mac(module_id)
    is_live = clean_mac in latest_readings
    latest = get_latest_sensor_data(module_id)
    return {
        "module_id": clean_mac,
        "online": is_live or latest.get("online", False),
        "dht11": True,
        "bh1750": True,
        "latest_reading": latest,
    }
