import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SPECIES_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SPECIES_SUPABASE_KEY") or os.getenv("SUPABASE_KEY")

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Successfully connected to Species Supabase project.")
    except Exception as e:
        print(f"[Database] Warning: Could not initialize Supabase client: {e}")
else:
    print("[Database] Warning: Missing SPECIES_SUPABASE_URL or SPECIES_SUPABASE_KEY in .env. Persistence disabled.")


def save_identification_log(
    verdict: str,
    total_images: int,
    detections_summary: Dict[str, Any],
    user_id: Optional[str] = None,
    plant_id: Optional[str] = None,
    image_filenames: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Save an identification record to Member IT22140616's Supabase database."""
    if not supabase:
        return None

    payload = {
        "verdict": verdict,
        "total_images": total_images,
        "detections": detections_summary,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if user_id:
        payload["user_id"] = user_id
    if plant_id:
        payload["plant_id"] = plant_id
    if image_filenames:
        payload["image_filenames"] = image_filenames

    try:
        res = supabase.table("species_identifications").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to insert identification record: {e}")
        return None


def get_user_identification_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieve historical identification records for a given user."""
    if not supabase or not user_id:
        return []

    try:
        res = (
            supabase.table("species_identifications")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch user history: {e}")
        return []
