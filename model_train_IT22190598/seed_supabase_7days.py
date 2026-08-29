import os
import requests
import random
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load sensitive environment variables from .env file
env_path = Path(__file__).resolve().parent / ".env"
backend_env_path = Path(__file__).resolve().parent / "backend" / ".env"

if env_path.exists():
    load_dotenv(env_path)
elif backend_env_path.exists():
    load_dotenv(backend_env_path)
else:
    load_dotenv()

# Sensitive credentials loaded strictly from .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Domain-specific plant & module identifiers
USER_ID = os.getenv("USER_ID")
PLANT_ID = os.getenv("PLANT_ID")
MODULE_ID = os.getenv("MODULE_ID")

def generate_and_seed_7days_hourly_data():
    """
    Generates 168 hourly IoT sensor reading records spanning the last 7 days (24 hours x 7 days)
    with natural diurnal temperature and humidity curves suitable for Dendrobium orchids.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[Error] SUPABASE_URL and SUPABASE_KEY must be set in your .env file.")
        return

    endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/readings"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    readings = []
    now = datetime.now()

    # Generate 168 hourly timestamps (24 readings/day for 7 days)
    for hour_offset in range(168, 0, -1):
        timestamp = now - timedelta(hours=hour_offset)
        hour = timestamp.hour

        # Simulate natural diurnal cycle (cooler at night, warmer at midday)
        base_temp = 27.5 + 4.0 * random.uniform(-0.5, 0.5)
        temp_cycle = 3.5 * ((1 + random.uniform(-0.1, 0.1)) * (1.0 if 10 <= hour <= 16 else -0.8))
        temp = round(base_temp + temp_cycle, 2)

        # Humidity inverse cycle (higher at night, lower at midday)
        base_hum = 70.0 + 5.0 * random.uniform(-0.5, 0.5)
        hum_cycle = -6.0 if (11 <= hour <= 15) else 5.0
        humidity = round(base_hum + hum_cycle, 2)

        # Light Lux cycle (0 at night, up to 35,000 at noon)
        if 6 <= hour <= 18:
            light = round(15000 + 15000 * random.uniform(0.5, 1.2), 2)
        else:
            light = 0.0

        record = {
            "temperature": temp,
            "humidity": humidity,
            "light": light,
            "user_id": USER_ID,
            "plant_id": PLANT_ID,
            "module_id": MODULE_ID,
            "created_at": timestamp.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        }
        readings.append(record)

    print(f"Uploading {len(readings)} hourly records (7 days x 24h) to Supabase URL: {SUPABASE_URL}...")
    res = requests.post(endpoint, json=readings, headers=headers)

    if res.status_code in [200, 201]:
        print(f"Success! 168 hourly IoT sensor records successfully inserted for Plant ID: {PLANT_ID} & Module ID: {MODULE_ID}.")
    else:
        print(f"Error ({res.status_code}): {res.text}")

if __name__ == "__main__":
    generate_and_seed_7days_hourly_data()
