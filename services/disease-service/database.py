import os
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from dotenv import load_dotenv
import httpx

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

FERTILIZER_SERVICE_URL = os.getenv("FERTILIZER_SERVICE_URL", "http://fertilizer-service:7860")

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
    """Forward NPK telemetry to single source of truth (fertilizer-service)."""
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                f"{FERTILIZER_SERVICE_URL}/api/sensors/npk",
                json={
                    "nitrogen_n": float(nitrogen),
                    "phosphorus_p": float(phosphorus),
                    "potassium_k": float(potassium),
                    "plant_id": plant_id,
                    "user_id": user_id,
                    "time_slot": time_slot,
                },
            )
            if resp.status_code in (200, 201):
                return resp.json()
    except Exception as e:
        print(f"[DiseaseService] Could not forward NPK reading to fertilizer-service: {e}")
    return None


def get_npk_window_for_plant(plant_id: Optional[str] = None, user_id: Optional[str] = None, days: int = NPK_WINDOW_DAYS) -> Dict[str, Any]:
    """
    Fetches rolling NPK deficiency window for a plant directly from fertilizer-service
    via internal Docker DNS (East-West communication).
    """
    url = f"{FERTILIZER_SERVICE_URL}/npk/plant/{plant_id}/window" if plant_id else f"{FERTILIZER_SERVICE_URL}/npk/plant/default/window"
    params = {"days": days}
    if user_id:
        params["user_id"] = user_id

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"[DiseaseService] Could not fetch NPK telemetry from fertilizer-service ({e}), using default fallback.")

    empty = {"N": None, "P": None, "K": None, "time": None}
    return {
        "rows": [],
        "latest": empty,
        "latest_status": {"N": "unknown", "P": "unknown", "K": "unknown"},
        "latest_advice": ["Soil NPK telemetry unavailable from fertilizer-service."],
        "window": {
            "sample_size": 0,
            "days": days,
            "mean": {"N": None, "P": None, "K": None},
            "mean_status": {"N": "unknown", "P": "unknown", "K": "unknown"},
            "mean_advice": ["No soil NPK telemetry available in last 7 days."],
            "has_deficiency": False,
            "deficient_nutrients": [],
            "excess_nutrients": [],
            "deficiency_msg": "No soil NPK telemetry available in last 7 days.",
        },
    }

