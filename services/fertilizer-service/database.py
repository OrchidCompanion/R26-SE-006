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

# Dedicated database for Growth Stage & Fertilizer Service (IT22085726)
DB_URL = os.getenv("FERTILIZER_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_fertilizer_db"

_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=DB_URL)
            print("[Database] Successfully connected to PostgreSQL orchid_fertilizer_db.")
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


def save_fertilizer_requirement(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO fertilizer_requirements
                        (plant_id, user_id, fertilizer, qty, unit, growth_stage,
                         leaf_dimensions, npk_analysis, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        payload.get("plant_id"),
                        payload.get("user_id"),
                        payload.get("fertilizer"),
                        payload.get("qty", 1.0),
                        payload.get("unit", "application"),
                        payload.get("growth_stage"),
                        Json(payload.get("leaf_dimensions")) if payload.get("leaf_dimensions") is not None else None,
                        Json(payload.get("npk_analysis")) if payload.get("npk_analysis") is not None else None,
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to save fertilizer requirement: {e}")
            return None


def get_user_fertilizer_requirements(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM fertilizer_requirements
                    WHERE user_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC;
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch requirements for user {user_id}: {e}")
            return []


def get_plant_fertilizer_requirements(plant_id: str) -> List[Dict[str, Any]]:
    if not plant_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM fertilizer_requirements
                    WHERE plant_id = %s AND deleted_at IS NULL
                    ORDER BY created_at DESC;
                    """,
                    (plant_id,),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch requirements for plant {plant_id}: {e}")
            return []


def get_fertilizer_requirement_by_id(requirement_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM fertilizer_requirements
                    WHERE requirement_id = %s AND deleted_at IS NULL;
                    """,
                    (requirement_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Failed to fetch requirement {requirement_id}: {e}")
            return None


def soft_delete_fertilizer_requirement(requirement_id: str) -> bool:
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE fertilizer_requirements
                    SET deleted_at = %s
                    WHERE requirement_id = %s AND deleted_at IS NULL;
                    """,
                    (datetime.now(timezone.utc), requirement_id),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to soft delete requirement {requirement_id}: {e}")
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


def get_latest_npk_reading(
    plant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    fallback = {
        "nitrogen": 45.0,
        "phosphorous": 25.0,
        "potassium": 80.0,
        "device_id": "esp32-s3-npk",
    }

    with get_db() as conn:
        if not conn:
            return fallback
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if plant_id:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        WHERE plant_id = %s
                        ORDER BY created_at DESC
                        LIMIT 1;
                        """,
                        (plant_id,),
                    )
                elif user_id:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        WHERE user_id = %s
                        ORDER BY created_at DESC
                        LIMIT 1;
                        """,
                        (user_id,),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM npk_history
                        ORDER BY created_at DESC
                        LIMIT 1;
                        """
                    )
                row = cur.fetchone()
                if row:
                    return {
                        "nitrogen": float(row.get("nitrogen_n", 45.0)),
                        "phosphorous": float(row.get("phosphorus_p", 25.0)),
                        "potassium": float(row.get("potassium_k", 80.0)),
                        "device_id": str(row.get("reading_id", "esp32-s3-npk")),
                    }
                return fallback
        except Exception as e:
            print(f"[Database] Could not fetch latest NPK ({e}), using standard fallback.")
            return fallback


def get_npk_readings_by_plant(plant_id: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
    with get_db() as conn:
        if not conn:
            return {"data": [], "total": 0, "page": page, "limit": limit}
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                offset = (page - 1) * limit
                cur.execute(
                    "SELECT COUNT(*) as total FROM npk_history WHERE plant_id = %s;",
                    (plant_id,),
                )
                total = cur.fetchone()["total"]

                cur.execute(
                    """
                    SELECT * FROM npk_history
                    WHERE plant_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s;
                    """,
                    (plant_id, limit, offset),
                )
                rows = cur.fetchall()
                data = []
                for r in rows:
                    item = dict(r)
                    if "reading_id" in item:
                        item["reading_id"] = str(item["reading_id"])
                    data.append(item)
                return {"data": data, "total": total, "page": page, "limit": limit}
        except Exception as e:
            print(f"[Database] Failed to get NPK readings for plant {plant_id}: {e}")
            return {"data": [], "total": 0, "page": page, "limit": limit}
