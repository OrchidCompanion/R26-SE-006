import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("FERTILIZER_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("FERTILIZER_SUPABASE_KEY") or os.getenv("SUPABASE_KEY")

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Successfully connected to Fertilizer Supabase project.")
    except Exception as e:
        print(f"[Database] Warning: Could not initialize Supabase client: {e}")
else:
    print("[Database] Warning: Missing FERTILIZER_SUPABASE_URL or FERTILIZER_SUPABASE_KEY. Persistence disabled.")


# ==============================================================================
# FERTILIZER REQUIREMENTS REPOSITORY
# ==============================================================================

def save_fertilizer_requirement(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("fertilizer_requirements").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to save fertilizer requirement: {e}")
        return None


def get_user_fertilizer_requirements(user_id: str) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("fertilizer_requirements")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch requirements for user {user_id}: {e}")
        return []


def get_plant_fertilizer_requirements(plant_id: str) -> List[Dict[str, Any]]:
    if not supabase or not plant_id:
        return []
    try:
        res = (
            supabase.table("fertilizer_requirements")
            .select("*")
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch requirements for plant {plant_id}: {e}")
        return []


def get_fertilizer_requirement_by_id(requirement_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("fertilizer_requirements")
            .select("*")
            .eq("requirement_id", requirement_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to fetch requirement {requirement_id}: {e}")
        return None


def soft_delete_fertilizer_requirement(requirement_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = (
            supabase.table("fertilizer_requirements")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("requirement_id", requirement_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[Database] Failed to soft delete requirement {requirement_id}: {e}")
        return False


# ==============================================================================
# SOIL NPK TELEMETRY
# ==============================================================================

def save_npk_reading(
    nitrogen: float,
    phosphorus: float,
    potassium: float,
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    time_slot: str = "morning",
) -> Optional[Dict[str, Any]]:
    """Persists real-time soil NPK reading ingested from ESP32 via MQTT or REST."""
    if not supabase:
        return None
    payload = {
        "nitrogen_n": float(nitrogen),
        "phosphorus_p": float(phosphorus),
        "potassium_k": float(potassium),
        "time_slot": time_slot,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if plant_id:
        payload["plant_id"] = plant_id
    if user_id:
        payload["user_id"] = user_id

    try:
        res = supabase.table("npk_history").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to insert NPK telemetry: {e}")
        return None


def get_latest_npk_reading(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieves latest soil NPK reading for a given plant or user, with standard fallbacks."""
    fallback = {
        "nitrogen": 45.0,
        "phosphorous": 25.0,
        "potassium": 80.0,
        "device_id": "esp32-s3-npk",
    }

    if not supabase:
        return fallback

    try:
        query = supabase.table("npk_history").select("*")
        if plant_id:
            query = query.eq("plant_id", plant_id)
        elif user_id:
            query = query.eq("user_id", user_id)

        res = query.order("created_at", desc=True).limit(1).execute()
        if res.data:
            row = res.data[0]
            return {
                "nitrogen": float(row.get("nitrogen_n", 45.0)),
                "phosphorous": float(row.get("phosphorus_p", 25.0)),
                "potassium": float(row.get("potassium_k", 80.0)),
                "device_id": row.get("reading_id", "esp32-s3-npk"),
            }
        return fallback
    except Exception as e:
        print(f"[Database] Could not fetch latest NPK ({e}), using standard fallback.")
        return fallback
