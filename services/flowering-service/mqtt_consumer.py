import os
import json
import threading
import time
from typing import Optional, Any
try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

from database import save_sensor_reading

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt-broker")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
ENABLE_MQTT = os.getenv("ENABLE_MQTT", "true").lower() in ("true", "1", "yes")

_client: Optional[Any] = None
_thread: Optional[threading.Thread] = None


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Flowering Service connected to broker at {MQTT_HOST}:{MQTT_PORT}")
        # Subscribe to environmental sensor telemetry topics
        client.subscribe("orchid/+/+/env")
        client.subscribe("orchid/sensors/env")
        client.subscribe("orchid/telemetry/env")
    else:
        print(f"[MQTT] Connection returned error code: {rc}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        parts = msg.topic.split("/")
        user_id = payload.get("user_id") or (parts[1] if len(parts) >= 4 and parts[1] != "sensors" else None)
        plant_id = payload.get("plant_id") or (parts[2] if len(parts) >= 4 else None)
        module_id = payload.get("module_id") or payload.get("mac_address")

        temp = payload.get("temperature") or payload.get("temp", 0)
        hum = payload.get("humidity") or payload.get("hum", 0)
        lux = payload.get("light") or payload.get("lux", 0)

        save_sensor_reading(
            temperature=float(temp),
            humidity=float(hum),
            light=float(lux),
            plant_id=plant_id,
            module_id=module_id,
            user_id=user_id,
        )
        print(f"[MQTT] Ingested Env reading for plant={plant_id} (Temp={temp}°C, Hum={hum}%, Lux={lux})")
    except Exception as e:
        print(f"[MQTT] Error processing message on {msg.topic}: {e}")


def start_mqtt_subscriber():
    """Starts the background MQTT subscriber thread."""
    global _client, _thread
    if not ENABLE_MQTT:
        print("[MQTT] Environmental MQTT listener disabled by configuration.")
        return

    if mqtt is None:
        print("[MQTT] Notice: 'paho-mqtt' is not installed locally. MQTT listener will run inside Docker.")
        return

    def run():
        global _client
        retries = 0
        while retries < 5:
            try:
                _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="flowering-service-subscriber")
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
