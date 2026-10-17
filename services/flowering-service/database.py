import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import numpy as np
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

PLACEMENT_SERVICE_URL = os.getenv("PLACEMENT_SERVICE_URL", "http://placement-service:7860")

# Dedicated database for Flowering Lifecycle Service (IT22190598)
DB_URL = os.getenv("FLOWERING_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_flowering_db"

_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=DB_URL)
            print("[Database] Successfully connected to PostgreSQL orchid_flowering_db.")
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


def save_prediction_history(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO prediction_history
                        (plant_id, user_id, module_id, current_stage, estimated_flowering_date,
                         flowering_date_range_display, total_days_to_flowering, display_total_days,
                         confidence, timeline, sensor_summary, environment_evaluation, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        payload.get("plant_id"),
                        payload.get("user_id"),
                        payload.get("module_id"),
                        payload.get("current_stage"),
                        payload.get("estimated_flowering_date"),
                        payload.get("flowering_date_range_display"),
                        payload.get("total_days_to_flowering"),
                        payload.get("display_total_days"),
                        payload.get("confidence"),
                        Json(payload.get("timeline")) if payload.get("timeline") is not None else None,
                        Json(payload.get("sensor_summary")) if payload.get("sensor_summary") is not None else None,
                        Json(payload.get("environment_evaluation")) if payload.get("environment_evaluation") is not None else None,
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to save bloom prediction record: {e}")
            return None


def get_plant_prediction_history(plant_id: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
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
                    SELECT COUNT(*) as total FROM prediction_history
                    WHERE plant_id = %s AND deleted_at IS NULL;
                    """,
                    (plant_id,),
                )
                total = cur.fetchone()["total"]

                cur.execute(
                    """
                    SELECT * FROM prediction_history
                    WHERE plant_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s;
                    """,
                    (plant_id, limit, offset),
                )
                rows = cur.fetchall()
                return {"data": [dict(r) for r in rows] if rows else [], "total": total, "page": page, "limit": limit}
        except Exception as e:
            print(f"[Database] Failed to fetch bloom history for plant {plant_id}: {e}")
            return {"data": [], "total": 0, "page": page, "limit": limit}


def get_user_prediction_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM prediction_history
                    WHERE user_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s;
                    """,
                    (user_id, limit),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch bloom records for user {user_id}: {e}")
            return []


def soft_delete_prediction_history(record_id: str) -> bool:
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE prediction_history
                    SET deleted_at = %s
                    WHERE id = %s AND deleted_at IS NULL;
                    """,
                    (datetime.now(timezone.utc), record_id),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to soft delete bloom record {record_id}: {e}")
            return False


def save_sensor_reading(
    temperature: float,
    humidity: float,
    light: float,
    plant_id: Optional[str] = None,
    module_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Forward DHT11 and BH1750 readings to single source of truth (placement-service)."""
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                f"{PLACEMENT_SERVICE_URL}/api/sensors/dht11",
                json={
                    "temperature": float(temperature),
                    "humidity": float(humidity),
                    "plant_id": plant_id,
                    "module_id": module_id,
                    "user_id": user_id,
                },
            )
            resp = client.post(
                f"{PLACEMENT_SERVICE_URL}/api/sensors/bh1750",
                json={
                    "lux": float(light),
                    "plant_id": plant_id,
                    "module_id": module_id,
                    "user_id": user_id,
                },
            )
            if resp.status_code in (200, 201):
                return resp.json()
    except Exception as e:
        print(f"[FloweringService] Could not forward sensor reading to placement-service: {e}")
    return None


def get_sensor_statistics(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Fetches rolling 30-day environmental telemetry summary for a plant directly
    from placement-service via internal Docker DNS (East-West communication).
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

    url = f"{PLACEMENT_SERVICE_URL}/telemetry/plant/{plant_id}/summary" if plant_id else f"{PLACEMENT_SERVICE_URL}/telemetry/plant/all/summary"
    params = {"days": days}
    if user_id:
        params["user_id"] = user_id

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    # If placement-service returned baseline or 0 samples, treat as no data
                    if data.get("is_default_baseline", False) or data.get("telemetry_samples_count", 0) == 0:
                        return None
                    return data
    except Exception as e:
        print(f"[FloweringService] Could not fetch sensor statistics from placement-service ({e}).")

    return None

