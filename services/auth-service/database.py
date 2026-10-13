import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from contextlib import contextmanager
from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from psycopg2 import pool
except ImportError:
    psycopg2 = None
    RealDictCursor = None
    pool = None

load_dotenv()

AUTH_DB_URL = os.getenv("AUTH_DB_URL")
if not AUTH_DB_URL:
    db_user = os.getenv("POSTGRES_USER", "orchid_admin")
    db_pass = os.getenv("POSTGRES_PASSWORD", "orchid_secret_2026")
    db_host = os.getenv("POSTGRES_HOST", "postgres-db")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    AUTH_DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/orchid_auth_db"

_connection_pool = None


def get_pool():
    global _connection_pool
    if _connection_pool is None and psycopg2 and AUTH_DB_URL:
        try:
            _connection_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, dsn=AUTH_DB_URL)
            print("[Auth DB] Successfully connected to PostgreSQL orchid_auth_db.")
        except Exception as e:
            print(f"[Auth DB] Warning: Could not connect to PostgreSQL ({e}).")
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


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve an active user by email."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT user_id, first_name, last_name, email, password, role, created_at, deleted_at
                    FROM users
                    WHERE LOWER(email) = LOWER(%s) AND deleted_at IS NULL
                    LIMIT 1;
                    """,
                    (email.strip(),),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Auth DB] Error fetching user by email: {e}")
            return None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve active user profile by user_id."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT user_id, first_name, last_name, email, role, created_at
                    FROM users
                    WHERE CAST(user_id AS TEXT) = %s AND deleted_at IS NULL
                    LIMIT 1;
                    """,
                    (str(user_id),),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"[Auth DB] Error fetching user by id: {e}")
            return None


def create_user(
    first_name: str,
    last_name: str,
    email: str,
    hashed_password: str,
    role: str = "user",
) -> Optional[Dict[str, Any]]:
    """Insert a new user record."""
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO users (first_name, last_name, email, password, role, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING user_id, first_name, last_name, email, role, created_at;
                    """,
                    (first_name.strip(), last_name.strip(), email.strip().lower(), hashed_password, role),
                )
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Auth DB] Error creating user: {e}")
            return None


def get_all_users() -> List[Dict[str, Any]]:
    """Admin: Fetch all active users with role 'user'."""
    with get_db() as conn:
        if not conn:
            return []
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT user_id, first_name, last_name, email, role, created_at
                    FROM users
                    WHERE role = 'user' AND deleted_at IS NULL
                    ORDER BY created_at DESC;
                    """
                )
                rows = cur.fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            print(f"[Auth DB] Error fetching all users: {e}")
            return []


def update_user_profile(user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update user profile fields."""
    if not fields:
        return get_user_by_id(user_id)

    with get_db() as conn:
        if not conn:
            return None
        try:
            set_clauses = []
            values = []
            for k, v in fields.items():
                if k in ["first_name", "last_name", "email"]:
                    set_clauses.append(f"{k} = %s")
                    values.append(v)
            if not set_clauses:
                return get_user_by_id(user_id)

            values.append(str(user_id))
            query = f"""
                UPDATE users
                SET {', '.join(set_clauses)}
                WHERE CAST(user_id AS TEXT) = %s AND deleted_at IS NULL
                RETURNING user_id, first_name, last_name, email, role, created_at;
            """
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, tuple(values))
                conn.commit()
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            conn.rollback()
            print(f"[Auth DB] Error updating user: {e}")
            return None


def soft_delete_user(user_id: str) -> bool:
    """Soft delete user by setting deleted_at."""
    with get_db() as conn:
        if not conn:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE users
                    SET deleted_at = NOW()
                    WHERE CAST(user_id AS TEXT) = %s AND deleted_at IS NULL;
                    """,
                    (str(user_id),),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            conn.rollback()
            print(f"[Auth DB] Error deleting user: {e}")
            return False
