import os
from typing import Optional, List, Dict, Any, Tuple
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
    module_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        if not conn:
            return None
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO npk_history
                        (nitrogen_n, phosphorus_p, potassium_k, plant_id, user_id, time_slot, module_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *;
                    """,
                    (
                        float(nitrogen),
                        float(phosphorus),
                        float(potassium),
                        plant_id,
                        user_id,
                        time_slot,
                        module_id,
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


def _classify_npk_val(val: Any, nutrient: str) -> str:
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


def _analyze_npk_pack(npk: Dict[str, Any]) -> Tuple[Dict[str, str], List[str]]:
    status: Dict[str, str] = {}
    advice: List[str] = []
    for nutrient in ("N", "P", "K"):
        key = _classify_npk_val(npk.get(nutrient), nutrient)
        status[nutrient] = key
        advice.append(ADVICE_MAP.get(f"{nutrient}_{key}", f"{nutrient} unknown"))
    return status, advice


def get_npk_window_for_plant(plant_id: Optional[str] = None, user_id: Optional[str] = None, days: int = 7) -> Dict[str, Any]:
    """
    Computes rolling NPK status and nutrient deficiency analysis for a plant over a window (default 7 days).
    Used by disease-service to cross-reference plant disease susceptibility with soil nutrient levels.
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows: List[Dict[str, Any]] = []

    with get_db() as conn:
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if plant_id:
                        cur.execute(
                            """
                            SELECT * FROM npk_history
                            WHERE plant_id = %s AND created_at >= %s
                            ORDER BY created_at DESC LIMIT 500;
                            """,
                            (plant_id, cutoff),
                        )
                    elif user_id:
                        cur.execute(
                            """
                            SELECT * FROM npk_history
                            WHERE user_id = %s AND created_at >= %s
                            ORDER BY created_at DESC LIMIT 500;
                            """,
                            (user_id, cutoff),
                        )
                    else:
                        cur.execute(
                            """
                            SELECT * FROM npk_history
                            WHERE created_at >= %s
                            ORDER BY created_at DESC LIMIT 500;
                            """,
                            (cutoff,),
                        )
                    fetched = cur.fetchall()
                    rows = [dict(r) for r in fetched] if fetched else []
            except Exception as e:
                print(f"[Database] Failed to query {days}-day NPK window: {e}")
                rows = []

    if not rows:
        empty = {"N": None, "P": None, "K": None, "time": None}
        unknown = {"N": "unknown", "P": "unknown", "K": "unknown"}
        return {
            "rows": [],
            "latest": empty,
            "latest_status": unknown,
            "latest_advice": [f"No recent NPK readings found in {days}-day window."],
            "window": {
                "sample_size": 0,
                "days": days,
                "window_days": days,
                "mean": empty,
                "mean_n": None,
                "mean_p": None,
                "mean_k": None,
                "mean_status": unknown,
                "mean_advice": [f"No soil NPK telemetry available in last {days} days."],
                "has_deficiency": False,
                "deficient_nutrients": [],
                "excess_nutrients": [],
                "deficiency_msg": f"No soil NPK telemetry available in last {days} days.",
            },
        }

    latest_row = rows[0]
    latest = {
        "N": latest_row.get("nitrogen_n"),
        "P": latest_row.get("phosphorus_p"),
        "K": latest_row.get("potassium_k"),
        "time": str(latest_row.get("created_at")),
    }
    latest_status, latest_advice = _analyze_npk_pack(latest)

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
    mean_status, mean_advice = _analyze_npk_pack(mean)

    names = {"N": "Nitrogen", "P": "Phosphorus", "K": "Potassium"}
    deficient = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "low"]
    excess = [names[n] for n in ("N", "P", "K") if mean_status.get(n) == "high"]
    if deficient:
        deficiency_msg = f"Deficiency detected: {', '.join(deficient)}."
    elif excess:
        deficiency_msg = f"Excess detected: {', '.join(excess)}."
    else:
        deficiency_msg = "7-day average NPK is within range."

    return {
        "rows": rows,
        "latest": latest,
        "latest_status": latest_status,
        "latest_advice": latest_advice,
        "window": {
            "sample_size": len(rows),
            "days": days,
            "window_days": days,
            "mean": mean,
            "mean_n": mean["N"],
            "mean_p": mean["P"],
            "mean_k": mean["K"],
            "mean_status": mean_status,
            "mean_advice": mean_advice,
            "has_deficiency": len(deficient) > 0,
            "deficient_nutrients": deficient,
            "excess_nutrients": excess,
            "deficiency_msg": deficiency_msg,
        },
    }

