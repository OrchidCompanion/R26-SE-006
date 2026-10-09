import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = (
    os.getenv("PLACEMENT_SUPABASE_URL")
    or os.getenv("LOCATIONS_SUPABASE_URL")
    or os.getenv("SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("PLACEMENT_SUPABASE_KEY")
    or os.getenv("LOCATIONS_SUPABASE_KEY")
    or os.getenv("SUPABASE_KEY")
)

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Successfully connected to Placement Supabase project.")
    except Exception as e:
        print(f"[Database] Warning: Could not initialize Supabase client: {e}")
else:
    print("[Database] Warning: Missing PLACEMENT_SUPABASE_URL or PLACEMENT_SUPABASE_KEY. Persistence disabled.")


# ==============================================================================
# LOCATION ZONES REPOSITORY
# ==============================================================================

def create_location(name: str, description: Optional[str], user_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("locations").insert({
            "location_name": name,
            "description": description,
            "user_id": user_id,
        }).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to create location: {e}")
        return None


def get_user_locations(user_id: str) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("locations")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch locations for user {user_id}: {e}")
        return []


def get_location_by_id(location_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("locations")
            .select("*")
            .eq("location_id", location_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to fetch location {location_id}: {e}")
        return None


def soft_delete_location(location_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = (
            supabase.table("locations")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("location_id", location_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[Database] Failed to delete location {location_id}: {e}")
        return False


# ==============================================================================
# SENSOR MODULE PAIRING REPOSITORY
# ==============================================================================

def register_module(
    module_id: str,
    device_name: str,
    user_id: str,
    location_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    payload = {
        "module_id": module_id.lower().replace(":", "").replace("-", ""),
        "device_name": device_name or "ESP32 S3 Node",
        "user_id": user_id,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }
    if location_id:
        payload["location_id"] = location_id

    try:
        # Upsert module
        res = supabase.table("sensor_modules").upsert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to register module: {e}")
        return None


def get_user_modules(user_id: str) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("sensor_modules")
            .select("*, locations(*)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch modules for user {user_id}: {e}")
        return []


def update_module_last_seen(module_id: str):
    if not supabase:
        return
    clean_id = module_id.lower().replace(":", "").replace("-", "")
    try:
        supabase.table("sensor_modules").update({
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }).eq("module_id", clean_id).execute()
    except Exception as e:
        print(f"[Database] Could not update last_seen for {clean_id}: {e}")


# ==============================================================================
# AMBIENT TELEMETRY & ANALYSIS TEST RECORDS
# ==============================================================================

def save_ambient_reading(module_id: str, temperature: float, humidity: float, lux: float):
    if not supabase:
        return
    clean_id = module_id.lower().replace(":", "").replace("-", "")
    try:
        supabase.table("ambient_telemetry").insert({
            "module_id": clean_id,
            "temperature": float(temperature),
            "humidity": float(humidity),
            "lux": float(lux),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        update_module_last_seen(clean_id)
    except Exception as e:
        print(f"[Database] Failed to record ambient reading: {e}")


def get_latest_ambient(module_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    clean_id = module_id.lower().replace(":", "").replace("-", "")
    try:
        res = (
            supabase.table("ambient_telemetry")
            .select("*")
            .eq("module_id", clean_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Could not fetch latest ambient for {clean_id}: {e}")
        return None


def save_analysis_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("location_analysis_records").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to save location test record: {e}")
        return None


def get_user_analysis_history(user_id: str) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("location_analysis_records")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch analysis history: {e}")
        return []
