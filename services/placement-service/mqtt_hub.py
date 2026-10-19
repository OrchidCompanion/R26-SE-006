import os
import json
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
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
# In-memory fast cache for live sensor readings and session logs
latest_readings: Dict[str, Dict[str, Any]] = {}
latest_npk_readings: Dict[str, Dict[str, Any]] = {}
session_records: Dict[str, List[Dict[str, Any]]] = {}


def normalize_mac(mac: str) -> str:
    return mac.lower().replace(":", "").replace("-", "").strip()


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Placement Service connected to broker at {MQTT_HOST}:{MQTT_PORT}")
        client.subscribe("orchid/+/env")
        client.subscribe("orchid/+/+/env")
        client.subscribe("orchid/sensors/env")
        client.subscribe("orchid/telemetry/env")
        client.subscribe("orchid/+/status")
        client.subscribe("orchid/+/npk")
        client.subscribe("orchid/+/npk/+")
        client.subscribe("orchid/npk/+/status")
        client.subscribe("orchid/npk/+/telemetry")
        client.subscribe("orchid/sensors/npk")
        client.subscribe("orchid/telemetry/npk")
    else:
        print(f"[MQTT] Connection returned error code: {rc}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        parts = msg.topic.split("/")

        # Extract MAC address / identifier
        module_id = (
            payload.get("module_id")
            or payload.get("mac_address")
            or payload.get("device_id")
        )
        if not module_id and len(parts) >= 3:
            if parts[1] == "npk" and len(parts) >= 4:
                module_id = parts[2]
            elif parts[1] not in ("sensors", "commands", "telemetry"):
                module_id = parts[1]
        if not module_id and len(parts) == 3 and parts[0] == "orchid" and parts[2] == "status":
            module_id = parts[1]

        if not module_id:
            return

        clean_mac = normalize_mac(module_id)

        is_npk = (
            "npk" in msg.topic.lower()
            or "npk" in str(payload.get("device_type", "")).lower()
            or "npk" in str(payload.get("device_name", "")).lower()
            or "nitrogen" in payload
            or "nitrogen_n" in payload
        )

        # Handle online status heartbeats
        if "status" in payload or payload.get("online") is True:
            is_online = payload.get("status") == "online" or payload.get("online") is True
            now_iso = datetime.now(timezone.utc).isoformat()
            target_dict = latest_npk_readings if is_npk else latest_readings

            if clean_mac not in target_dict:
                target_dict[clean_mac] = {"online": is_online, "timestamp": now_iso}
            else:
                target_dict[clean_mac]["online"] = is_online
                target_dict[clean_mac]["timestamp"] = now_iso

            if "dht11" in payload:
                target_dict[clean_mac]["dht11"] = bool(payload["dht11"])
            elif "dht_ok" in payload:
                target_dict[clean_mac]["dht11"] = bool(payload["dht_ok"])
            if "bh1750" in payload:
                target_dict[clean_mac]["bh1750"] = bool(payload["bh1750"])
            if "npk_probe" in payload:
                target_dict[clean_mac]["npk_probe"] = bool(payload["npk_probe"])
            elif "sensor_ok" in payload and is_npk:
                target_dict[clean_mac]["npk_probe"] = bool(payload["sensor_ok"])

            update_module_last_seen(clean_mac)
            print(f"[MQTT] Heartbeat received from {clean_mac} ({'NPK' if is_npk else 'ENV'}): online={is_online}")

        temp = payload.get("temperature") or payload.get("temp")
        hum = payload.get("humidity") or payload.get("hum")
        lux = payload.get("light") or payload.get("lux")

        if temp is not None and hum is not None and lux is not None:
            dht_flag = payload.get("dht11", payload.get("dht_ok", True))
            bh_flag = payload.get("bh1750", True)
            latest_readings[clean_mac] = {
                "temperature": float(temp),
                "humidity": float(hum),
                "lux": float(lux),
                "dht11": bool(dht_flag),
                "bh1750": bool(bh_flag),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "online": True,
            }

            # Store in session records
            sample_idx = payload.get("sample_index")
            sample_data = {
                "sample_index": int(sample_idx) if sample_idx is not None else (len(session_records.get(clean_mac, [])) + 1),
                "total_samples": int(payload.get("total_samples", 3)),
                "temperature": float(temp),
                "humidity": float(hum),
                "lux": float(lux),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "buffered": bool(payload.get("buffered", False)),
            }
            if clean_mac not in session_records:
                session_records[clean_mac] = []
            
            # Avoid immediate duplicate if already logged with same sample_index
            if not any(s.get("sample_index") == sample_data["sample_index"] for s in session_records[clean_mac]):
                session_records[clean_mac].append(sample_data)
                session_records[clean_mac] = session_records[clean_mac][-10:]

            # Persist to database
            save_ambient_reading(
                module_id=clean_mac,
                temperature=float(temp),
                humidity=float(hum),
                lux=float(lux),
            )
            print(f"[MQTT] Ambient reading recorded for {clean_mac} (sample {sample_data['sample_index']}/{sample_data['total_samples']}): T={temp}°C, H={hum}%, L={lux} Lux, buffered={sample_data['buffered']}")

        # Handle NPK sensor telemetry
        n = payload.get("nitrogen") or payload.get("nitrogen_n")
        p = payload.get("phosphorus") or payload.get("phosphorus_p")
        k = payload.get("potassium") or payload.get("potassium_k")
        if n is not None and p is not None and k is not None:
            latest_npk_readings[clean_mac] = {
                "nitrogen_n": float(n),
                "phosphorus_p": float(p),
                "potassium_k": float(k),
                "npk_probe": bool(payload.get("npk_probe", payload.get("sensor_ok", True))),
                "sensor_ok": bool(payload.get("sensor_ok", payload.get("npk_probe", True))),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "online": True,
            }
            if clean_mac in latest_readings:
                latest_readings[clean_mac]["online"] = True
            else:
                latest_readings[clean_mac] = {"online": True}
            update_module_last_seen(clean_mac)
            print(f"[MQTT] NPK reading captured for {clean_mac}: N={n}, P={p}, K={k}")
    except Exception as e:
        print(f"[MQTT] Error handling message on {msg.topic}: {e}")


def trigger_mqtt_ambient_read(module_id: str, timeout_seconds: float = 3.0) -> Optional[Dict[str, Any]]:
    """Publishes a trigger command over MQTT to the ESP32 and waits for response."""
    global _client
    if not _client or not _client.is_connected():
        return None

    clean_mac = normalize_mac(module_id)
    prev_time = latest_readings.get(clean_mac, {}).get("timestamp")

    cmd = json.dumps({"action": "read_now"})
    _client.publish(f"orchid/{clean_mac}/command", cmd)
    _client.publish("orchid/commands/env", cmd)

    start = time.time()
    while time.time() - start < timeout_seconds:
        time.sleep(0.2)
        curr = latest_readings.get(clean_mac)
        if curr and curr.get("timestamp") != prev_time and "temperature" in curr:
            return curr

    # If ESP32 did not respond within timeout, it is offline
    return None


def trigger_mqtt_npk_read(module_id: str, timeout_seconds: float = 6.0) -> Optional[Dict[str, Any]]:
    """Publishes a trigger command over MQTT to the NPK ESP32 and waits for response."""
    global _client
    if not _client or not _client.is_connected():
        return None

    clean_mac = normalize_mac(module_id)
    prev_time = latest_npk_readings.get(clean_mac, {}).get("timestamp")

    cmd = json.dumps({"action": "read_npk"})
    _client.publish(f"orchid/{clean_mac}/command", cmd)
    _client.publish(f"orchid/npk/{clean_mac}/command", cmd)
    _client.publish("orchid/commands/npk", cmd)

    start = time.time()
    while time.time() - start < timeout_seconds:
        time.sleep(0.2)
        curr = latest_npk_readings.get(clean_mac)
        if curr and curr.get("timestamp") != prev_time and "nitrogen_n" in curr:
            return curr

    # If ESP32 did not respond with fresh reading in time, check recent cached reading (within 120s)
    curr = latest_npk_readings.get(clean_mac)
    if curr and is_recently_active(curr.get("timestamp"), max_age_seconds=120.0) and "nitrogen_n" in curr:
        return curr

    return None


def trigger_mqtt_session(module_id: str, samples: int = 3, interval_sec: int = 20) -> bool:
    """Publishes a start_session command over MQTT to initiate autonomous sampling."""
    global _client
    if not _client or not _client.is_connected():
        return False

    clean_mac = normalize_mac(module_id)
    cmd = json.dumps({
        "action": "start_session",
        "samples": samples,
        "interval_sec": interval_sec,
    })
    _client.publish(f"orchid/{clean_mac}/command", cmd)
    _client.publish("orchid/commands/env", cmd)
    print(f"[MQTT] Sent start_session command to {clean_mac}: samples={samples}, interval={interval_sec}s")
    return True


def get_session_readings(module_id: str) -> List[Dict[str, Any]]:
    """Returns list of session readings captured for module_id."""
    clean_mac = normalize_mac(module_id)
    return session_records.get(clean_mac, [])


def clear_session_readings(module_id: str):
    """Clears current session records for module_id."""
    clean_mac = normalize_mac(module_id)
    session_records[clean_mac] = []


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


def is_recently_active(timestamp_str: Optional[str], max_age_seconds: float = 180.0) -> bool:
    if not timestamp_str:
        return False
    try:
        ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - ts).total_seconds() <= max_age_seconds
    except Exception:
        return False


def get_sensor_module_status(module_id: str, is_npk: bool = False) -> Dict[str, Any]:
    """Checks whether the ESP32 is online and streaming."""
    clean_mac = normalize_mac(module_id)
    if is_npk:
        cached = latest_npk_readings.get(clean_mac)
        has_recent = cached and is_recently_active(cached.get("timestamp"), max_age_seconds=180.0)
        is_online = bool(has_recent and cached.get("online", False))
        if not is_online:
            # Fallback to general readings heartbeat if received
            gen_cached = latest_readings.get(clean_mac)
            if gen_cached and is_recently_active(gen_cached.get("timestamp"), max_age_seconds=180.0) and gen_cached.get("online"):
                is_online = True
        return {
            "module_id": clean_mac,
            "online": is_online,
            "sensor_type": "npk",
            "npk_probe": is_online,
            "dht11": False,
            "bh1750": False,
            "latest_reading": cached if is_online else None,
            "msg": "NPK Sensor operational over MQTT." if is_online else "NPK Sensor is offline. Please power on the ESP32.",
        }
    else:
        cached = latest_readings.get(clean_mac)
        has_recent = cached and is_recently_active(cached.get("timestamp"), max_age_seconds=180.0)
        is_online = bool(has_recent and cached.get("online", False))
        dht_ok = is_online and bool(cached.get("dht11", cached.get("dht_ok", True)))
        bh_ok = is_online and bool(cached.get("bh1750", True))
        return {
            "module_id": clean_mac,
            "online": is_online,
            "sensor_type": "env",
            "dht11": dht_ok,
            "bh1750": bh_ok,
            "latest_reading": cached if is_online else None,
            "msg": "Sensors operational over MQTT." if (is_online and dht_ok and bh_ok) else ("Sensor module online, but probe fault detected." if is_online else "Sensor module is offline. Please power on the ESP32."),
        }
