import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

SAMPLE_SUPABASE_READINGS = [
    {
        "reading_id": "7297568b-d0d3-4855-b3d2-02cbfe737d8a",
        "temperature": 28.5,
        "humidity": 67.6,
        "user_id": "47d388cc-703e-46b3-8cb9-4fd6cb616613",
        "plant_id": "029282a6-ecbe-441f-84c0-ce107f6470d9",
        "module_id": "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
        "created_at": "2026-08-11T15:22:05.67226+00:00"
    },
    {
        "reading_id": "beaf7ca0-485b-45a3-8395-ac89d009642d",
        "temperature": 28.6,
        "humidity": 67.6,
        "user_id": "47d388cc-703e-46b3-8cb9-4fd6cb616613",
        "plant_id": "029282a6-ecbe-441f-84c0-ce107f6470d9",
        "module_id": "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
        "created_at": "2026-08-11T15:22:02.154158+00:00"
    },
    {
        "reading_id": "383a3194-f522-45c9-9077-ae4375b222ca",
        "temperature": 28.0,
        "humidity": 67.2,
        "user_id": "47d388cc-703e-46b3-8cb9-4fd6cb616613",
        "plant_id": "029282a6-ecbe-441f-84c0-ce107f6470d9",
        "module_id": "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
        "created_at": "2026-08-11T15:21:53.37486+00:00"
    },
    {
        "reading_id": "cc80c3ff-c0fc-486c-8ded-9ac27541bf2f",
        "temperature": 27.9,
        "humidity": 68.4,
        "user_id": "47d388cc-703e-46b3-8cb9-4fd6cb616613",
        "plant_id": "029282a6-ecbe-441f-84c0-ce107f6470d9",
        "module_id": "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
        "created_at": "2026-08-11T15:21:40.72165+00:00"
    },
    {
        "reading_id": "5fce158a-a622-43cf-b03b-1f3ad9f5a3f7",
        "temperature": 27.8,
        "humidity": 68.5,
        "user_id": "47d388cc-703e-46b3-8cb9-4fd6cb616613",
        "plant_id": "029282a6-ecbe-441f-84c0-ce107f6470d9",
        "module_id": "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
        "created_at": "2026-08-11T15:21:21.626804+00:00"
    }
]

def test_parse_supabase_readings():
    response = client.post(
        "/api/v1/supabase/parse-readings",
        json={"readings": SAMPLE_SUPABASE_READINGS}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    summary = data["sensor_summary"]

    assert summary["readings_count"] == 5
    assert summary["min_temp_c"] == 27.8
    assert summary["max_temp_c"] == 28.6
    assert round(summary["avg_temp_c"], 1) == 28.2
    assert summary["min_humidity_rh"] == 67.2
    assert summary["max_humidity_rh"] == 68.5
    assert round(summary["avg_humidity_rh"], 1) == 67.9
