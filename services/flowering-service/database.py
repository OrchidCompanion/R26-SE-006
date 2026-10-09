import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import numpy as np
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
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO readings
                        (temperature, humidity, light, plant_id, module_id, user_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        float(temperature),
                        float(humidity),
                        float(light),
                        plant_id,
                        module_id,
                        user_id,
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to insert environmental reading: {e}")
            return None


def get_sensor_statistics(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
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

    with get_db() as conn:
        if not conn:
            return default_stats
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)
                if plant_id:
                    cur.execute(
                        """
                        SELECT temperature, humidity, light FROM readings
                        WHERE plant_id = %s AND created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 1000;
                        """,
                        (plant_id, cutoff),
                    )
                elif user_id:
                    cur.execute(
                        """
                        SELECT temperature, humidity, light FROM readings
                        WHERE user_id = %s AND created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 1000;
                        """,
                        (user_id, cutoff),
                    )
                else:
                    cur.execute(
                        """
                        SELECT temperature, humidity, light FROM readings
                        WHERE created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 1000;
                        """,
                        (cutoff,),
                    )
                rows = cur.fetchall()
                rows = [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Could not calculate sensor stats ({e}), using baseline.")
            return default_stats

    if not rows:
        return default_stats

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
