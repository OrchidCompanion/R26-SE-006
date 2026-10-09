import os
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor, Json
    from psycopg2 import pool
except ImportError:
    psycopg2 = None
    RealDictCursor = None
    Json = None
    pool = None

load_dotenv()

# Dedicated database for Disease & Treatment Service (IT22250124)
DB_URL = os.getenv("DISEASE_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_disease_db"

_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=DB_URL)
            print("[Database] Successfully connected to PostgreSQL orchid_disease_db.")
        except Exception as e:
            print(f"[Database] Warning: Could not connect to PostgreSQL ({e}). Running in offline/inference mode.")
            _connection_pool = None
    return _connection_pool

@contextmanager
def get_db():
    p = get_pool()
    if not p:
        yield None
        return
    conn = p.getconn()
    try:
        yield conn
    finally:
        p.putconn(conn)


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
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO disease_analysis
                        (user_id, plant_id, verdict, disease_name, disease_info, confidence,
                         treatment, npk_reading, npk_status, npk_advice, result_image_b64, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        payload.get("user_id"),
                        payload.get("plant_id"),
                        payload.get("verdict", "Unknown"),
                        payload.get("disease_name", "Unknown"),
                        payload.get("disease_info"),
                        payload.get("confidence"),
                        Json(payload.get("treatment")) if payload.get("treatment") is not None else None,
                        Json(payload.get("npk_reading")) if payload.get("npk_reading") is not None else None,
                        Json(payload.get("npk_status")) if payload.get("npk_status") is not None else None,
                        Json(payload.get("npk_advice")) if payload.get("npk_advice") is not None else None,
                        payload.get("result_image_b64"),
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to insert disease diagnosis: {e}")
            return None


def get_user_diagnoses(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM disease_analysis
                    WHERE user_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC;
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch diagnoses for user {user_id}: {e}")
            return []


def get_plant_diagnoses(plant_id: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
    if not plant_id:
        return {"data": [], "total": 0, "page": page, "limit": limit}
    with get_db() as conn:
        if not conn:
            return {"data": [], "total": 0, "page": page, "limit": limit}
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                offset = (page - 1) * limit
                cur.execute(
                    """
                    SELECT COUNT(*) as total FROM disease_analysis
                    WHERE plant_id = %s AND deleted_at IS NULL;
                    """,
                    (plant_id,),
                )
                total = cur.fetchone()["total"]

                cur.execute(
                    """
                    SELECT * FROM disease_analysis
                    WHERE plant_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s;
                    """,
                    (plant_id, limit, offset),
                )
                rows = cur.fetchall()
                return {"data": [dict(r) for r in rows] if rows else [], "total": total, "page": page, "limit": limit}
        except Exception as e:
            print(f"[Database] Failed to fetch diagnoses for plant {plant_id}: {e}")
            return {"data": [], "total": 0, "page": page, "limit": limit}


def get_diagnosis_by_id(analysis_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM disease_analysis
                    WHERE analysis_id = %s AND deleted_at IS NULL;
                    """,
                    (analysis_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Failed to fetch diagnosis {analysis_id}: {e}")
            return None


def soft_delete_diagnosis(analysis_id: str) -> bool:
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE disease_analysis
                    SET deleted_at = %s
                    WHERE analysis_id = %s AND deleted_at IS NULL;
                    """,
                    (datetime.now(timezone.utc), analysis_id),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to soft delete diagnosis {analysis_id}: {e}")
            return False


def save_npk_reading(
    nitrogen: float,
    phosphorus: float,
    potassium: float,
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    time_slot: str = "morning",
) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO npk_history
                        (nitrogen_n, phosphorus_p, potassium_k, plant_id, user_id, time_slot, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        float(nitrogen),
                        float(phosphorus),
                        float(potassium),
                        plant_id,
                        user_id,
                        time_slot,
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
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
    with get_db() as conn:
        if not conn:
            empty = {"N": None, "P": None, "K": None, "time": None}
            return {
                "rows": [],
                "latest": empty,
                "latest_status": {"N": "unknown", "P": "unknown", "K": "unknown"},
                "latest_advice": ["No database connected."],
                "window": {"has_deficiency": False, "deficient_nutrients": [], "excess_nutrients": []},
            }
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cutoff = datetime.now(timezone.utc) - timedelta(days=NPK_WINDOW_DAYS)
                if plant_id:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        WHERE plant_id = %s AND created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 500;
                        """,
                        (plant_id, cutoff),
                    )
                elif user_id:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        WHERE user_id = %s AND created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 500;
                        """,
                        (user_id, cutoff),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        WHERE created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 500;
                        """,
                        (cutoff,),
                    )
                rows = cur.fetchall()
                rows = [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to query 7-day NPK window: {e}")
            rows = []

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
