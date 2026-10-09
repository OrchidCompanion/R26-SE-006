import os
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("DISEASE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("DISEASE_SUPABASE_KEY") or os.getenv("SUPABASE_KEY")

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Successfully connected to Disease Supabase project.")
    except Exception as e:
        print(f"[Database] Warning: Could not initialize Supabase client: {e}")
else:
    print("[Database] Warning: Missing DISEASE_SUPABASE_URL or DISEASE_SUPABASE_KEY. Persistence disabled.")

NPK_THRESHOLDS = {
    "N": {"low": 25, "high": 65},
    "P": {"low": 15, "high": 35},
    "K": {"low": 50, "high": 130},
}

ADVICE_MAP = {
    "N_low": "Apply nitrogen-rich fertilizer",
    "N_high": "Reduce nitrogen application",
    "P_low": "Apply phosphorus fertilizer",
    "P_high": "Reduce phosphorus application",
    "K_low": "Apply potassium fertilizer",
    "K_high": "Leach cocopeat with water",
    "N_ok": "Nitrogen OK",
    "P_ok": "Phosphorus OK",
    "K_ok": "Potassium OK",
}

NPK_WINDOW_DAYS = 7


def save_diagnosis(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("disease_analysis").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to insert disease diagnosis: {e}")
        return None


def get_user_diagnoses(user_id: str) -> List[Dict[str, Any]]:
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table("disease_analysis")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[Database] Failed to fetch diagnoses for user {user_id}: {e}")
        return []


def get_plant_diagnoses(plant_id: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
    if not supabase or not plant_id:
        return {"data": [], "total": 0, "page": page, "limit": limit}
    try:
        start = (page - 1) * limit
        res = (
            supabase.table("disease_analysis")
            .select("*", count="exact")
            .eq("plant_id", plant_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .range(start, start + limit - 1)
            .execute()
        )
        return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}
    except Exception as e:
        print(f"[Database] Failed to fetch diagnoses for plant {plant_id}: {e}")
        return {"data": [], "total": 0, "page": page, "limit": limit}


def get_diagnosis_by_id(analysis_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("disease_analysis")
            .select("*")
            .eq("analysis_id", analysis_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Database] Failed to fetch diagnosis {analysis_id}: {e}")
        return None


def soft_delete_diagnosis(analysis_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = (
            supabase.table("disease_analysis")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("analysis_id", analysis_id)
            .is_("deleted_at", "null")
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[Database] Failed to soft delete diagnosis {analysis_id}: {e}")
        return False


# ==============================================================================
# NPK TELEMETRY & CORRELATION ENGINE
# ==============================================================================

def save_npk_reading(
    nitrogen: float,
    phosphorus: float,
    potassium: float,
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    time_slot: str = "morning",
) -> Optional[Dict[str, Any]]:
    """Save an incoming NPK reading from MQTT or REST into Member IT22250124's DB."""
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


def _classify_npk_value(val: Any, nutrient: str) -> str:
    if val is None:
        return "unknown"
    try:
        val = float(val)
    except (TypeError, ValueError):
        return "unknown"
    low = NPK_THRESHOLDS[nutrient]["low"]
    high = NPK_THRESHOLDS[nutrient]["high"]
    if val < low:
        return "low"
    if val > high:
        return "high"
    return "ok"


def _analyze_npk(npk: Dict[str, Any]) -> Tuple[Dict[str, str], List[str]]:
    status: Dict[str, str] = {}
    advice: List[str] = []
    for nutrient in ("N", "P", "K"):
        key = _classify_npk_value(npk.get(nutrient), nutrient)
        status[nutrient] = key
        advice.append(ADVICE_MAP.get(f"{nutrient}_{key}", f"{nutrient} unknown"))
    return status, advice


def get_npk_window_for_plant(plant_id: Optional[str] = None, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Calculate 7-day NPK window and nutritional status for disease correlation."""
    if not supabase:
        empty = {"N": None, "P": None, "K": None, "time": None}
        return {
            "rows": [],
            "latest": empty,
            "latest_status": {"N": "unknown", "P": "unknown", "K": "unknown"},
            "latest_advice": ["No database connected."],
            "window": {"has_deficiency": False, "deficient_nutrients": [], "excess_nutrients": []},
        }

    cutoff = (datetime.now(timezone.utc) - timedelta(days=NPK_WINDOW_DAYS)).isoformat()
    query = supabase.table("npk_history").select("*").gte("created_at", cutoff)
    if plant_id:
        query = query.eq("plant_id", plant_id)
    elif user_id:
        query = query.eq("user_id", user_id)

    res = query.order("created_at", desc=True).limit(500).execute()
    rows = res.data or []

    if not rows:
        empty = {"N": None, "P": None, "K": None, "time": None}
        return {
            "rows": [],
            "latest": empty,
            "latest_status": {"N": "unknown", "P": "unknown", "K": "unknown"},
            "latest_advice": ["No recent NPK readings found in 7-day window."],
            "window": {
                "sample_size": 0,
                "has_deficiency": False,
                "deficient_nutrients": [],
                "excess_nutrients": [],
                "deficiency_msg": "No soil NPK telemetry available in last 7 days.",
            },
        }

    latest_row = rows[0]
    latest = {
        "N": latest_row.get("nitrogen_n"),
        "P": latest_row.get("phosphorus_p"),
        "K": latest_row.get("potassium_k"),
        "time": latest_row.get("created_at"),
    }
    latest_status, latest_advice = _analyze_npk(latest)

    # Calculate 7-day mean
    totals: Dict[str, List[float]] = {"N": [], "P": [], "K": []}
    for r in rows:
        for nut, col in (("N", "nitrogen_n"), ("P", "phosphorus_p"), ("K", "potassium_k")):
            val = r.get(col)
            if val is not None:
                try:
                    totals[nut].append(float(val))
                except ValueError:
                    pass

    mean = {
        n: round(sum(totals[n]) / len(totals[n]), 2) if totals[n] else None
        for n in ("N", "P", "K")
    }
    mean_status, _ = _analyze_npk(mean)

    names = {"N": "Nitrogen", "P": "Phosphorus", "K": "Potassium"}
    deficient = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "low"]
    excess = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "high"]
    has_deficiency = len(deficient) > 0

    if has_deficiency:
        deficiency_msg = f"Nutrient deficiency detected: {', '.join(deficient)} low."
    elif excess:
        deficiency_msg = f"No nutrient deficiency. Excess detected: {', '.join(excess)} high."
    else:
        deficiency_msg = "7-day NPK averages are in healthy range."

    return {
        "rows": rows,
        "latest": latest,
        "latest_status": latest_status,
        "latest_advice": latest_advice,
        "window": {
            "sample_size": len(rows),
            "days": NPK_WINDOW_DAYS,
            "mean": mean,
            "mean_status": mean_status,
            "has_deficiency": has_deficiency,
            "deficient_nutrients": deficient,
            "excess_nutrients": excess,
            "deficiency_msg": deficiency_msg,
        },
    }
