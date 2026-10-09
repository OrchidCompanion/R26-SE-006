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

# Dedicated database for Species Identification (IT22140616)
DB_URL = os.getenv("SPECIES_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_species_db"

_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=DB_URL)
            print("[Database] Successfully connected to PostgreSQL orchid_species_db.")
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


def save_identification_log(
    verdict: str,
    total_images: int,
    detections_summary: Dict[str, Any],
    user_id: Optional[str] = None,
    plant_id: Optional[str] = None,
    image_filenames: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Save an identification record to PostgreSQL orchid_species_db."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO species_identifications
                        (verdict, total_images, detections, user_id, plant_id, image_filenames, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        verdict,
                        total_images,
                        Json(detections_summary),
                        user_id,
                        plant_id,
                        image_filenames,
                        datetime.now(timezone.utc),
                    ),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to insert species identification: {e}")
            return None


def get_user_identification_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieve historical identification records for a given user from PostgreSQL."""
    if not user_id:
        return []
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM species_identifications
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s;
                    """,
                    (user_id, limit),
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch species history: {e}")
            return []
