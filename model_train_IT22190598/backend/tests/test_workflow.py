import pytest
import os
import sys
from fastapi.testclient import TestClient

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_predict_transition_endpoint():
    payload = {
        "current_stage": "Vegetative",
        "month": 5,
        "day_of_year": 140,
        "avg_temp_c": 26.0,
        "min_temp_c": 20.0,
        "max_temp_c": 30.0,
        "temp_std_c": 2.5,
        "avg_humidity_rh": 65.0,
        "min_humidity_rh": 50.0,
        "max_humidity_rh": 80.0,
        "humidity_std_rh": 6.0,
        "avg_light_lux": 12000.0,
        "min_light_lux": 2500.0,
        "max_light_lux": 25000.0,
        "light_std_lux": 6000.0
    }
    response = client.post("/api/v1/predict-transition", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["current_stage"] == "Vegetative"
    assert data["next_stage"] == "Mature_Pseudobulb"
    assert data["predicted_transition_days"] > 0

def test_flowering_terminal_endpoint():
    payload = {"current_stage": "Flowering"}
    response = client.post("/api/v1/predict-transition", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["current_stage"] == "Flowering"
    assert data["next_stage"] is None
    assert "currently flowering" in data["message"]
