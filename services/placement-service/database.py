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
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ambient_telemetry (module_id, temperature, humidity, lux, created_at)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (clean_id, float(temperature), float(humidity), float(lux), datetime.now(timezone.utc)),
                )
                conn.commit()
            update_module_last_seen(clean_id)
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to record ambient reading: {e}")


def get_latest_ambient(module_id: str) -> Optional[Dict[str, Any]]:
    clean_id = module_id.lower().replace(":", "").replace("-", "").strip()
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM ambient_telemetry
                    WHERE module_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1;
                    """,
                    (clean_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Could not fetch latest ambient for {clean_id}: {e}")
            return None


def save_analysis_record(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO location_analysis_records
                        (user_id, module_id, species, readings, averages, verdict, recommendation, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        payload.get("user_id"),
                        payload.get("module_id"),
                        payload.get("species", "Dendrobium"),
                        Json(payload.get("readings")) if payload.get("readings") is not None else None,
                        Json(payload.get("averages")) if payload.get("averages") is not None else None,
                        payload.get("verdict"),
                        payload.get("recommendation"),
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to save location test record: {e}")
            return None


def get_user_analysis_history(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM location_analysis_records
                    WHERE user_id = %s
                    ORDER BY created_at DESC;
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch analysis history: {e}")
            return []
