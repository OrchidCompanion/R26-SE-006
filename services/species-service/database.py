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


# ==============================================================================
# Plants Management (Domain: Species & Botanical Catalog)
# ==============================================================================

def create_plant_record(
    plant_name: str,
    plant_species: str,
    user_id: str,
    plant_location: Optional[str] = None,
    location_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Insert a new orchid plant record into orchid_species_db."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO plants (plant_name, plant_species, user_id, plant_location, location_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING *;
                    """,
                    (plant_name.strip(), plant_species.strip(), str(user_id), plant_location, location_id),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to insert plant: {e}")
            return None


def get_plants_list(user_id: Optional[str] = None, is_admin: bool = False) -> List[Dict[str, Any]]:
    """Fetch all active plants for a user or all if admin."""
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if is_admin or not user_id:
                    cur.execute(
                        """
                        SELECT * FROM plants
                        WHERE deleted_at IS NULL
                        ORDER BY created_at DESC;
                        """
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM plants
                        WHERE user_id = %s AND deleted_at IS NULL
                        ORDER BY created_at DESC;
                        """,
                        (str(user_id),),
                    )
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
        except Exception as e:
            print(f"[Database] Failed to fetch plants: {e}")
            return []


def get_plant_by_id(plant_id: str) -> Optional[Dict[str, Any]]:
    """Fetch single plant details by plant_id."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM plants
                    WHERE CAST(plant_id AS TEXT) = %s AND deleted_at IS NULL
                    LIMIT 1;
                    """,
                    (str(plant_id),),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Database] Failed to fetch plant by id: {e}")
            return None


def update_plant_record(plant_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update plant fields."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            set_clauses = []
            values = []
            for k, v in fields.items():
                if k in ["plant_name", "plant_species", "plant_location", "location_id"]:
                    set_clauses.append(f"{k} = %s")
                    values.append(v)
            if not set_clauses:
                return get_plant_by_id(plant_id)

            values.append(str(plant_id))
            query = f"""
                UPDATE plants
                SET {', '.join(set_clauses)}
                WHERE CAST(plant_id AS TEXT) = %s AND deleted_at IS NULL
                RETURNING *;
            """
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, tuple(values))
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to update plant: {e}")
            return None


def soft_delete_plant_record(plant_id: str) -> bool:
    """Soft delete plant."""
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE plants
                    SET deleted_at = NOW()
                    WHERE CAST(plant_id AS TEXT) = %s AND deleted_at IS NULL;
                    """,
                    (str(plant_id),),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Database] Failed to delete plant: {e}")
            return False

