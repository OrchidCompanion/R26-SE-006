import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
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

# Dedicated database for Plant Placement Analysis Service
DB_URL = os.getenv("PLACEMENT_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_placement_db"

_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=DB_URL)
            print("[Database] Successfully connected to PostgreSQL orchid_placement_db.")
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


def create_location(name: str, description: Optional[str], user_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO locations (location_name, description, user_id, created_at)
                    VALUES (%s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (name, description, user_id, datetime.now(timezone.utc)),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to create location: {e}")
            return None


def get_user_locations(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM locations
                    WHERE user_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC;
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch locations for user {user_id}: {e}")
            return []


def get_location_by_id(location_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM locations
                    WHERE location_id = %s AND deleted_at IS NULL;
                    """,
                    (location_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Failed to fetch location {location_id}: {e}")
            return None


def soft_delete_location(location_id: str) -> bool:
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE locations
                    SET deleted_at = %s
                    WHERE location_id = %s AND deleted_at IS NULL;
                    """,
                    (datetime.now(timezone.utc), location_id),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to delete location {location_id}: {e}")
            return False


def update_location(location_id: str, name: Optional[str] = None, description: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE locations
                    SET location_name = COALESCE(%s, location_name),
                        description = COALESCE(%s, description)
                    WHERE location_id = %s AND deleted_at IS NULL
                    RETURNING *;
                    """,
                    (name, description, location_id),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to update location {location_id}: {e}")
            return None


def register_module(
    module_id: str,
    device_name: str,
    user_id: str,
    location_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO sensor_modules
                        (module_id, device_name, user_id, location_id, last_seen, is_active, created_at)
                    VALUES (%s, %s, %s, %s, %s, TRUE, %s)
                    ON CONFLICT (module_id) DO UPDATE
                    SET device_name = EXCLUDED.device_name,
                        user_id = EXCLUDED.user_id,
                        location_id = EXCLUDED.location_id,
                        last_seen = EXCLUDED.last_seen,
                        is_active = TRUE
                    RETURNING *;
                    """,
                    (
                        clean_id,
                        device_name or "ESP32 S3 Node",
                        user_id,
                        location_id,
                        datetime.now(timezone.utc),
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to register module: {e}")
            return None


def get_user_modules(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT m.*, l.location_name
                    FROM sensor_modules m
                    LEFT JOIN locations l ON m.location_id = l.location_id
                    WHERE m.user_id = %s
                    ORDER BY m.created_at DESC;
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch modules for user {user_id}: {e}")
            return []


def delete_module(module_id: str) -> bool:
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sensor_modules WHERE module_id = %s;", (clean_id,))
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to delete module {clean_id}: {e}")
            return False


def get_module(module_id: str) -> Optional[Dict[str, Any]]:
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM sensor_modules WHERE module_id = %s;", (clean_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Failed to get module {clean_id}: {e}")
            return None


def update_module_last_seen(module_id: str):
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sensor_modules
                    SET last_seen = %s
                    WHERE module_id = %s;
                    """,
                    (datetime.now(timezone.utc), clean_id),
                )
                conn.commit()
        except Exception as e:
            print(f"[Database] Could not update last_seen for {clean_id}: {e}")


def save_ambient_reading(module_id: str, temperature: float, humidity: float, lux: float):
    """In-memory telemetry update; records last_seen on module without database table bloat."""
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    update_module_last_seen(clean_id)


def get_latest_ambient(module_id: str) -> Optional[Dict[str, Any]]:
    return None


def save_analysis_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # Location analysis evaluations are delivered live to frontend without persisting to DB
    return payload


def get_user_analysis_history(user_id: str) -> List[Dict[str, Any]]:
    return []


# ==============================================================================
# DHT11 & BH1750 SENSOR TELEMETRY HISTORY (Single Source of Truth)
# ==============================================================================

def save_dht11_reading(
    temperature: float,
    humidity: float,
    location_id: Optional[str] = None,
    module_id: Optional[str] = None,
    time_slot: str = "morning",
    user_id: Optional[str] = None,
    plant_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO dht11_history
                        (temperature, humidity, location_id, module_id, time_slot, user_id, plant_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (temperature, humidity, location_id, module_id, time_slot, user_id, plant_id, datetime.now(timezone.utc)),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to save DHT11 reading: {e}")
            return None


def get_dht11_readings(
    plant_id: Optional[str] = None,
    location_id: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
) -> Dict[str, Any]:
    with get_db() as conn:
        if not conn:
            return {"data": [], "total": 0, "page": page, "limit": limit}
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                offset = (page - 1) * limit
                query = "SELECT * FROM dht11_history WHERE 1=1"
                count_query = "SELECT COUNT(*) as total FROM dht11_history WHERE 1=1"
                params = []
                count_params = []

                if plant_id:
                    query += " AND (plant_id = %s"
                    count_query += " AND (plant_id = %s"
                    params.append(plant_id)
                    count_params.append(plant_id)
                    if location_id:
                        query += " OR location_id = %s)"
                        count_query += " OR location_id = %s)"
                        params.append(location_id)
                        count_params.append(location_id)
                    else:
                        query += ")"
                        count_query += ")"
                elif location_id:
                    query += " AND location_id = %s"
                    count_query += " AND location_id = %s"
                    params.append(location_id)
                    count_params.append(location_id)

                cur.execute(count_query, tuple(count_params))
                total = cur.fetchone()["total"]

                query += " ORDER BY created_at DESC LIMIT %s OFFSET %s;"
                params.extend([limit, offset])
                cur.execute(query, tuple(params))
                rows = cur.fetchall()

                return {
                    "data": [dict(r) for r in rows] if rows else [],
                    "total": total,
                    "page": page,
                    "limit": limit,
                }
        except Exception as e:
            print(f"[Database] Failed to get DHT11 readings: {e}")
            return {"data": [], "total": 0, "page": page, "limit": limit}


def save_bh1750_reading(
    lux: float,
    location_id: Optional[str] = None,
    module_id: Optional[str] = None,
    time_slot: str = "morning",
    user_id: Optional[str] = None,
    plant_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO bh1750_history
                        (lux, location_id, module_id, time_slot, user_id, plant_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (lux, location_id, module_id, time_slot, user_id, plant_id, datetime.now(timezone.utc)),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to save BH1750 reading: {e}")
            return None


def get_bh1750_readings(
    plant_id: Optional[str] = None,
    location_id: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
) -> Dict[str, Any]:
    with get_db() as conn:
        if not conn:
            return {"data": [], "total": 0, "page": page, "limit": limit}
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                offset = (page - 1) * limit
                query = "SELECT * FROM bh1750_history WHERE 1=1"
                count_query = "SELECT COUNT(*) as total FROM bh1750_history WHERE 1=1"
                params = []
                count_params = []

                if plant_id:
                    query += " AND (plant_id = %s"
                    count_query += " AND (plant_id = %s"
                    params.append(plant_id)
                    count_params.append(plant_id)
                    if location_id:
                        query += " OR location_id = %s)"
                        count_query += " OR location_id = %s)"
                        params.append(location_id)
                        count_params.append(location_id)
                    else:
                        query += ")"
                        count_query += ")"
                elif location_id:
                    query += " AND location_id = %s"
                    count_query += " AND location_id = %s"
                    params.append(location_id)
                    count_params.append(location_id)

                cur.execute(count_query, tuple(count_params))
                total = cur.fetchone()["total"]

                query += " ORDER BY created_at DESC LIMIT %s OFFSET %s;"
                params.extend([limit, offset])
                cur.execute(query, tuple(params))
                rows = cur.fetchall()

                return {
                    "data": [dict(r) for r in rows] if rows else [],
                    "total": total,
                    "page": page,
                    "limit": limit,
                }
        except Exception as e:
            print(f"[Database] Failed to get BH1750 readings: {e}")
            return {"data": [], "total": 0, "page": page, "limit": limit}


def get_plant_environmental_summary(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Computes rolling environmental statistics (DHT11 temperature/humidity and BH1750 light lux)
    for a given plant over the requested window (default: 30 days).
    Used directly by flowering-service for its Gradient Boosting bloom timeline forecaster.
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

    with get_db() as conn:
        if not conn:
            return default_stats
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                from datetime import timedelta
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)

                # Fetch DHT11 readings
                if plant_id:
                    cur.execute(
                        """
                        SELECT temperature, humidity FROM dht11_history
                        WHERE plant_id = %s AND created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (plant_id, cutoff),
                    )
                elif user_id:
                    cur.execute(
                        """
                        SELECT temperature, humidity FROM dht11_history
                        WHERE user_id = %s AND created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (user_id, cutoff),
                    )
                else:
                    cur.execute(
                        """
                        SELECT temperature, humidity FROM dht11_history
                        WHERE created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (cutoff,),
                    )
                dht_rows = cur.fetchall()

                # Fetch BH1750 readings
                if plant_id:
                    cur.execute(
                        """
                        SELECT lux FROM bh1750_history
                        WHERE plant_id = %s AND created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (plant_id, cutoff),
                    )
                elif user_id:
                    cur.execute(
                        """
                        SELECT lux FROM bh1750_history
                        WHERE user_id = %s AND created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (user_id, cutoff),
                    )
                else:
                    cur.execute(
                        """
                        SELECT lux FROM bh1750_history
                        WHERE created_at >= %s
                        ORDER BY created_at DESC LIMIT 1000;
                        """,
                        (cutoff,),
                    )
                bh_rows = cur.fetchall()

                if not dht_rows and not bh_rows:
                    return default_stats

                import numpy as np

                temps = [float(r["temperature"]) for r in dht_rows if r.get("temperature") is not None]
                hums = [float(r["humidity"]) for r in dht_rows if r.get("humidity") is not None]
                luxs = [float(r["lux"]) for r in bh_rows if r.get("lux") is not None]

                sample_count = max(len(temps), len(luxs))
                if sample_count == 0:
                    return default_stats

                return {
                    "avg_temp_c": round(float(np.mean(temps)), 2) if temps else 27.5,
                    "min_temp_c": round(float(np.min(temps)), 2) if temps else 25.0,
                    "max_temp_c": round(float(np.max(temps)), 2) if temps else 30.0,
                    "temp_std_c": round(float(np.std(temps)), 2) if len(temps) > 1 else 1.5,
                    "avg_humidity_rh": round(float(np.mean(hums)), 2) if hums else 72.5,
                    "min_humidity_rh": round(float(np.min(hums)), 2) if hums else 68.0,
                    "max_humidity_rh": round(float(np.max(hums)), 2) if hums else 76.0,
                    "humidity_std_rh": round(float(np.std(hums)), 2) if len(hums) > 1 else 2.0,
                    "avg_light_lux": round(float(np.mean(luxs)), 2) if luxs else 20000.0,
                    "min_light_lux": round(float(np.min(luxs)), 2) if luxs else 16000.0,
                    "max_light_lux": round(float(np.max(luxs)), 2) if luxs else 26000.0,
                    "light_std_lux": round(float(np.std(luxs)), 2) if len(luxs) > 1 else 2500.0,
                    "data_window_days": days,
                    "telemetry_samples_count": sample_count,
                    "is_default_baseline": False,
                }
        except Exception as e:
            print(f"[Database] Could not aggregate environmental statistics: {e}")
            return default_stats
