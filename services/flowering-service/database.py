import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = (
    os.getenv("FLOWERING_SUPABASE_URL")
    or os.getenv("BLOOM_SUPABASE_URL")
    or os.getenv("SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("FLOWERING_SUPABASE_KEY")
    or os.getenv("BLOOM_SUPABASE_KEY")
    or os.getenv("SUPABASE_KEY")
)

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Successfully connected to Flowering Supabase project.")
    except Exception as e:
        print(f"[Database] Warning: Could not initialize Supabase client: {e}")
else:
    print("[Database] Warning: Missing FLOWERING_SUPABASE_URL or FLOWERING_SUPABASE_KEY. Persistence disabled.")


# ==============================================================================
# PREDICTION HISTORY REPOSITORY
# ==============================================================================

def save_prediction_history(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("prediction_history").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to save bloom prediction record: {e}")
        return None


def get_plant_prediction_history(plant_id: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
    if not supabase or not plant_id:
        return {"data": [], "total": 0, "page": page, "limit": limit}
    try:
        start = (page - 1) * limit
        res = (
            supabase.table("prediction_history")
            .select("*", count="exact")
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .range(start, start + limit - 1)
            .execute()
        )
        return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}
    except Exception as e:
        print(f"[Database] Failed to fetch bloom history for plant {plant_id}: {e}")
        return {"data": [], "total": 0, "page": page, "limit": limit}


def get_user_prediction_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("prediction_history")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch bloom records for user {user_id}: {e}")
        return []


def soft_delete_prediction_history(record_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = (
            supabase.table("prediction_history")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", record_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[Database] Failed to soft delete bloom record {record_id}: {e}")
        return False


# ==============================================================================
# SENSOR TELEMETRY & STATISTICAL AGGREGATION
# ==============================================================================

def save_sensor_reading(
    temperature: float,
    humidity: float,
    light: float,
    plant_id: Optional[str] = None,
    module_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Persists real-time sensor reading ingested from ESP32 via MQTT or REST."""
    if not supabase:
        return None
    payload = {
        "temperature": float(temperature),
        "humidity": float(humidity),
        "light": float(light),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if plant_id:
        payload["plant_id"] = plant_id
    if module_id:
        payload["module_id"] = module_id
    if user_id:
        payload["user_id"] = user_id

    try:
        res = supabase.table("readings").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to insert environmental reading: {e}")
        return None


def get_sensor_statistics(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Computes environmental statistical metrics (mean, min, max, std)
    over the given temporal window for Model 02 regression forecasting.
    Falls back to optimal Dendrobium environmental baselines if telemetry is empty.
    """
    default_stats = {
        "avg_temp_c": 27.5,
        "min_temp_c": 25.0,
        "max_temp_c": 30.0,
        "temp_std_c": 1.5,
        "avg_humidity_rh": 72.5,
        "min_humidity_rh": 68.0,
        "max_humidity_rh": 76.0,
        "humidity_std_rh": 2.0,
        "avg_light_lux": 20000.0,
        "min_light_lux": 16000.0,
        "max_light_lux": 26000.0,
        "light_std_lux": 2500.0,
        "data_window_days": days,
        "telemetry_samples_count": 0,
        "is_default_baseline": True,
    }

    if not supabase:
        return default_stats

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query = supabase.table("readings").select("temperature, humidity, light, created_at").gte("created_at", cutoff)

        if plant_id:
            query = query.eq("plant_id", plant_id)
        elif user_id:
            query = query.eq("user_id", user_id)

        res = query.order("created_at", desc=True).limit(1000).execute()
        rows = res.data or []

        temps = [float(r["temperature"]) for r in rows if r.get("temperature") is not None]
        hums = [float(r["humidity"]) for r in rows if r.get("humidity") is not None]
        luxs = [float(r["light"]) for r in rows if r.get("light") is not None]

        if not temps or not hums or not luxs:
            return default_stats

        return {
            "avg_temp_c": round(float(np.mean(temps)), 2),
            "min_temp_c": round(float(np.min(temps)), 2),
            "max_temp_c": round(float(np.max(temps)), 2),
            "temp_std_c": round(float(np.std(temps)), 2) if len(temps) > 1 else 0.0,
            "avg_humidity_rh": round(float(np.mean(hums)), 2),
            "min_humidity_rh": round(float(np.min(hums)), 2),
            "max_humidity_rh": round(float(np.max(hums)), 2),
            "humidity_std_rh": round(float(np.std(hums)), 2) if len(hums) > 1 else 0.0,
            "avg_light_lux": round(float(np.mean(luxs)), 2),
            "min_light_lux": round(float(np.min(luxs)), 2),
            "max_light_lux": round(float(np.max(luxs)), 2),
            "light_std_lux": round(float(np.std(luxs)), 2) if len(luxs) > 1 else 0.0,
            "data_window_days": days,
            "telemetry_samples_count": len(rows),
            "is_default_baseline": False,
        }
    except Exception as e:
        print(f"[Database] Could not calculate sensor stats ({e}), using baseline.")
        return default_stats
