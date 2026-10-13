import os
import sys
import csv
import json
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values, Json

# Allow large fields (e.g. base64 image strings in disease_analysis)
csv.field_size_limit(sys.maxsize)

VPS_HOST = "169.58.119.186"
VPS_PORT = 5432
DB_USER = "orchid_admin"
DB_PASS = "orchid_secret_2026"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "supabase_data")


def get_conn(dbname: str):
    return psycopg2.connect(
        host=VPS_HOST,
        port=VPS_PORT,
        user=DB_USER,
        password=DB_PASS,
        dbname=dbname
    )


def clean_val(v):
    if v is None:
        return None
    v = v.strip() if isinstance(v, str) else v
    if v == "":
        return None
    return v


def parse_json_val(v):
    if not v:
        return None
    if isinstance(v, (dict, list)):
        return Json(v)
    try:
        loaded = json.loads(v)
        return Json(loaded)
    except Exception:
        return v


def read_csv(filename):
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        print(f"[!] Warning: File {filepath} not found!")
        return [], []
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = [row for row in reader]
    return headers, rows


# ==============================================================================
# 1. Users Migration (orchid_auth_db)
# ==============================================================================
def migrate_users():
    print("\n--- Migrating Users -> orchid_auth_db.users ---")
    _, rows = read_csv("users_rows.csv")
    if not rows:
        return

    conn = get_conn("orchid_auth_db")
    cur = conn.cursor()
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;")

    inserted = 0
    for r in rows:
        user_id = clean_val(r.get("user_id"))
        email = clean_val(r.get("email"))
        first_name = clean_val(r.get("first_name"))
        last_name = clean_val(r.get("last_name"))
        password = clean_val(r.get("password"))
        role = clean_val(r.get("role")) or "user"
        created_at = clean_val(r.get("created_at"))
        updated_at = clean_val(r.get("updated_at"))
        deleted_at = clean_val(r.get("deleted_at"))

        cur.execute(
            """
            INSERT INTO users (user_id, first_name, last_name, email, password, role, created_at, updated_at, deleted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (email) DO UPDATE
            SET first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                password = EXCLUDED.password,
                role = EXCLUDED.role,
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at;
            """,
            (user_id, first_name, last_name, email, password, role, created_at, updated_at, deleted_at)
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"  [OK] Processed {inserted} users in orchid_auth_db.")


# ==============================================================================
# 2. Locations & Sensor Modules Migration (orchid_placement_db)
# ==============================================================================
def migrate_locations_and_modules():
    print("\n--- Migrating Locations & Modules -> orchid_placement_db ---")
    conn = get_conn("orchid_placement_db")
    cur = conn.cursor()

    cur.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;")
    cur.execute("ALTER TABLE sensor_module ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;")

    # Locations
    _, loc_rows = read_csv("locations_rows.csv")
    loc_count = 0
    for r in loc_rows:
        loc_id = clean_val(r.get("location_id"))
        loc_name = clean_val(r.get("location_name"))
        desc = clean_val(r.get("description"))
        user_id = clean_val(r.get("user_id"))
        created_at = clean_val(r.get("created_at"))
        updated_at = clean_val(r.get("updated_at"))

        cur.execute(
            """
            INSERT INTO locations (location_id, location_name, description, user_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (location_id) DO UPDATE
            SET location_name = EXCLUDED.location_name,
                description = EXCLUDED.description,
                user_id = EXCLUDED.user_id,
                updated_at = EXCLUDED.updated_at;
            """,
            (loc_id, loc_name, desc, user_id, created_at, updated_at)
        )
        loc_count += 1
    print(f"  [OK] Processed {loc_count} locations in orchid_placement_db.")

    # Sensor Module
    _, mod_rows = read_csv("sensor_module_rows.csv")
    mod_count = 0
    for r in mod_rows:
        mod_id = clean_val(r.get("module_id"))
        dev_name = clean_val(r.get("device_name")) or "ESP32 S3 Sensor"
        user_id = clean_val(r.get("user_id"))
        is_active = str(clean_val(r.get("is_active"))).lower() in ("true", "1", "t") if clean_val(r.get("is_active")) is not None else True
        last_seen = clean_val(r.get("last_seen"))
        created_at = clean_val(r.get("created_at"))
        updated_at = clean_val(r.get("updated_at"))

        cur.execute(
            """
            INSERT INTO sensor_module (module_id, device_name, user_id, is_active, last_seen, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (module_id) DO UPDATE
            SET device_name = EXCLUDED.device_name,
                user_id = EXCLUDED.user_id,
                is_active = EXCLUDED.is_active,
                last_seen = EXCLUDED.last_seen,
                updated_at = EXCLUDED.updated_at;
            """,
            (mod_id, dev_name, user_id, is_active, last_seen, created_at, updated_at)
        )
        mod_count += 1
    print(f"  [OK] Processed {mod_count} sensor modules in orchid_placement_db.")

    conn.commit()
    conn.close()


# ==============================================================================
# 3. Ambient Telemetry History (orchid_placement_db)
# ==============================================================================
def migrate_environment_history():
    print("\n--- Migrating DHT11 & BH1750 History -> orchid_placement_db ---")
    conn = get_conn("orchid_placement_db")
    cur = conn.cursor()

    cur.execute("ALTER TABLE dht11_environment_history ADD COLUMN IF NOT EXISTS reading_id UUID;")
    cur.execute("ALTER TABLE bh1750_environment_history ADD COLUMN IF NOT EXISTS reading_id UUID;")

    # DHT11
    _, dht_rows = read_csv("dht11_environment_history_rows.csv")
    dht_count = 0
    for r in dht_rows:
        rid = clean_val(r.get("reading_id"))
        temp = clean_val(r.get("temperature"))
        hum = clean_val(r.get("humidity"))
        slot = clean_val(r.get("time_slot")) or "morning"
        loc_id = clean_val(r.get("location_id"))
        uid = clean_val(r.get("user_id"))
        mid = clean_val(r.get("module_id"))
        created_at = clean_val(r.get("created_at"))

        cur.execute(
            """
            INSERT INTO dht11_environment_history (id, reading_id, temperature, humidity, time_slot, location_id, user_id, module_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
            """,
            (rid, rid, temp, hum, slot, loc_id, uid, mid, created_at)
        )
        dht_count += 1
    print(f"  [OK] Processed {dht_count} DHT11 environment records.")

    # BH1750
    _, bh_rows = read_csv("bh1750_environment_history_rows.csv")
    bh_count = 0
    for r in bh_rows:
        rid = clean_val(r.get("reading_id"))
        lux = clean_val(r.get("lux"))
        slot = clean_val(r.get("time_slot")) or "morning"
        loc_id = clean_val(r.get("location_id"))
        uid = clean_val(r.get("user_id"))
        mid = clean_val(r.get("module_id"))
        created_at = clean_val(r.get("created_at"))

        cur.execute(
            """
            INSERT INTO bh1750_environment_history (id, reading_id, lux, time_slot, location_id, user_id, module_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
            """,
            (rid, rid, lux, slot, loc_id, uid, mid, created_at)
        )
        bh_count += 1
    print(f"  [OK] Processed {bh_count} BH1750 environment records.")

    conn.commit()
    conn.close()


# ==============================================================================
# 4. Plants Migration (orchid_species_db)
# ==============================================================================
def migrate_plants():
    print("\n--- Migrating Plants -> orchid_species_db.plants ---")
    conn = get_conn("orchid_species_db")
    cur = conn.cursor()

    cur.execute("ALTER TABLE plants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;")

    _, plant_rows = read_csv("plants_rows.csv")
    p_count = 0
    for r in plant_rows:
        pid = clean_val(r.get("plant_id"))
        pname = clean_val(r.get("plant_name"))
        pspec = clean_val(r.get("plant_species"))
        uid = clean_val(r.get("user_id"))
        loc_id = clean_val(r.get("location_id"))
        created_at = clean_val(r.get("created_at"))
        updated_at = clean_val(r.get("updated_at"))
        deleted_at = clean_val(r.get("deleted_at"))

        cur.execute(
            """
            INSERT INTO plants (plant_id, plant_name, plant_species, user_id, location_id, created_at, updated_at, deleted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (plant_id) DO UPDATE
            SET plant_name = EXCLUDED.plant_name,
                plant_species = EXCLUDED.plant_species,
                user_id = EXCLUDED.user_id,
                location_id = EXCLUDED.location_id,
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at;
            """,
            (pid, pname, pspec, uid, loc_id, created_at, updated_at, deleted_at)
        )
        p_count += 1

    conn.commit()
    conn.close()
    print(f"  [OK] Processed {p_count} plants in orchid_species_db.")


# ==============================================================================
# 5. Disease Analysis (orchid_disease_db)
# ==============================================================================
def migrate_disease_analysis():
    print("\n--- Migrating Disease Analysis -> orchid_disease_db.disease_analysis ---")
    conn = get_conn("orchid_disease_db")
    cur = conn.cursor()

    _, rows = read_csv("disease_analysis_rows.csv")
    d_count = 0
    for r in rows:
        aid = clean_val(r.get("analysis_id"))
        uid = clean_val(r.get("user_id"))
        pid = clean_val(r.get("plant_id"))
        verdict = clean_val(r.get("verdict")) or "UNKNOWN"
        dname = clean_val(r.get("disease_name")) or "Unknown"
        dinfo = clean_val(r.get("disease_info"))
        conf = clean_val(r.get("confidence"))
        treat = parse_json_val(r.get("treatment"))
        npk_r = parse_json_val(r.get("npk_reading"))
        npk_s = parse_json_val(r.get("npk_status"))
        npk_a = parse_json_val(r.get("npk_advice"))
        img_b64 = clean_val(r.get("result_image_b64"))
        created_at = clean_val(r.get("created_at"))
        deleted_at = clean_val(r.get("deleted_at"))

        cur.execute(
            """
            INSERT INTO disease_analysis (
                analysis_id, user_id, plant_id, verdict, disease_name, disease_info,
                confidence, treatment, npk_reading, npk_status, npk_advice,
                result_image_b64, created_at, deleted_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (analysis_id) DO UPDATE
            SET verdict = EXCLUDED.verdict,
                disease_name = EXCLUDED.disease_name,
                confidence = EXCLUDED.confidence,
                treatment = EXCLUDED.treatment,
                deleted_at = EXCLUDED.deleted_at;
            """,
            (aid, uid, pid, verdict, dname, dinfo, conf, treat, npk_r, npk_s, npk_a, img_b64, created_at, deleted_at)
        )
        d_count += 1

    conn.commit()
    conn.close()
    print(f"  [OK] Processed {d_count} disease analysis records in orchid_disease_db.")


# ==============================================================================
# 6. NPK History (orchid_fertilizer_db & orchid_disease_db)
# ==============================================================================
def migrate_npk_history():
    print("\n--- Migrating NPK History -> orchid_fertilizer_db & orchid_disease_db ---")
    _, rows = read_csv("npk_history_rows.csv")

    for dbname in ["orchid_fertilizer_db", "orchid_disease_db"]:
        conn = get_conn(dbname)
        cur = conn.cursor()
        cur.execute("ALTER TABLE npk_history ADD COLUMN IF NOT EXISTS module_id VARCHAR(255);")

        count = 0
        for r in rows:
            rid = clean_val(r.get("reading_id"))
            n = clean_val(r.get("nitrogen_n"))
            p = clean_val(r.get("phosphorus_p"))
            k = clean_val(r.get("potassium_k"))
            pid = clean_val(r.get("plant_id"))
            uid = clean_val(r.get("user_id"))
            mid = clean_val(r.get("module_id"))
            slot = clean_val(r.get("time_slot")) or "morning"
            created_at = clean_val(r.get("created_at"))

            cur.execute(
                """
                INSERT INTO npk_history (reading_id, nitrogen_n, phosphorus_p, potassium_k, plant_id, user_id, module_id, time_slot, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (reading_id) DO NOTHING;
                """,
                (rid, n, p, k, pid, uid, mid, slot, created_at)
            )
            count += 1

        conn.commit()
        conn.close()
        print(f"  [OK] Processed {count} NPK records in {dbname}.")


# ==============================================================================
# 7. Fertilizer Requirements (orchid_fertilizer_db)
# ==============================================================================
def migrate_fertilizer_requirements():
    print("\n--- Migrating Fertilizer Requirements -> orchid_fertilizer_db ---")
    conn = get_conn("orchid_fertilizer_db")
    cur = conn.cursor()

    cur.execute("ALTER TABLE fertilizer_requirements ADD COLUMN IF NOT EXISTS record_id UUID;")

    _, rows = read_csv("fertilizer_requirements_rows.csv")
    f_count = 0
    for r in rows:
        rid = clean_val(r.get("record_id"))
        fert = clean_val(r.get("fertilizer"))
        qty = clean_val(r.get("qty")) or 1.0
        unit = clean_val(r.get("unit")) or "application"
        pid = clean_val(r.get("plant_id"))
        uid = clean_val(r.get("user_id"))
        created_at = clean_val(r.get("created_at"))
        deleted_at = clean_val(r.get("deleted_at"))

        cur.execute(
            """
            INSERT INTO fertilizer_requirements (requirement_id, record_id, fertilizer, qty, unit, plant_id, user_id, created_at, deleted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (requirement_id) DO NOTHING;
            """,
            (rid, rid, fert, qty, unit, pid, uid, created_at, deleted_at)
        )
        f_count += 1

    conn.commit()
    conn.close()
    print(f"  [OK] Processed {f_count} fertilizer requirement records.")


# ==============================================================================
# 8. Predicted Bloom (orchid_flowering_db)
# ==============================================================================
def migrate_predicted_bloom():
    print("\n--- Migrating Predicted Bloom -> orchid_flowering_db.predicted_bloom ---")
    conn = get_conn("orchid_flowering_db")
    cur = conn.cursor()

    _, rows = read_csv("predicted_bloom_rows.csv")
    b_count = 0
    for r in rows:
        rid = clean_val(r.get("record_id"))
        weeks = clean_val(r.get("weeks"))
        pid = clean_val(r.get("plant_id"))
        uid = clean_val(r.get("user_id"))
        created_at = clean_val(r.get("created_at"))
        deleted_at = clean_val(r.get("deleted_at"))

        cur.execute(
            """
            INSERT INTO predicted_bloom (id, record_id, weeks, plant_id, user_id, created_at, deleted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
            """,
            (rid, rid, weeks, pid, uid, created_at, deleted_at)
        )
        b_count += 1

    conn.commit()
    conn.close()
    print(f"  [OK] Processed {b_count} predicted bloom records.")


def main():
    print("==================================================================")
    print("      ORCHIDCOMPANION SUPABASE -> CONTABO VPS MIGRATION")
    print("==================================================================")
    migrate_users()
    migrate_locations_and_modules()
    migrate_environment_history()
    migrate_plants()
    migrate_disease_analysis()
    migrate_npk_history()
    migrate_fertilizer_requirements()
    migrate_predicted_bloom()
    print("\n==================================================================")
    print("      ALL SUPABASE DATA SUCCESSFULLY MIGRATED TO VPS!")
    print("==================================================================")


if __name__ == "__main__":
    main()
