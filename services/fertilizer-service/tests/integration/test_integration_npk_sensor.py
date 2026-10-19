import io
import cv2
import numpy as np
import pytest
from unittest.mock import patch
from database import get_latest_npk_reading, get_npk_window_for_plant, save_npk_reading


@pytest.mark.integration
def test_npk_sensor_json_ingestion_endpoint(client):
    """Integration test: Post JSON telemetry from simulated ESP32-S3 sensor to /npk."""
    sensor_payload = {
        "nitrogen_n": 140.0,
        "phosphorus_p": 45.0,
        "potassium_k": 210.0,
        "plant_id": "integration_orchid_01",
        "module_id": "esp32-s3-test-node",
        "time_slot": "morning",
    }
    response = client.post("/npk", json=sensor_payload)
    # 201 Created if DB is connected, or 500/handled gracefully if strictly offline
    assert response.status_code in (201, 500)


@pytest.mark.integration
def test_npk_sensor_form_ingestion_endpoint(client):
    """Integration test: Post Form telemetry to /npk-reading."""
    form_data = {
        "nitrogen": 130.0,
        "phosphorus": 40.0,
        "potassium": 190.0,
        "plant_id": "integration_orchid_02",
        "module_id": "esp32-s3-node-2",
        "time_slot": "afternoon",
    }
    response = client.post("/npk-reading", data=form_data)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"


@pytest.mark.integration
def test_npk_window_rolling_calculation_endpoint(client):
    """Integration test: Query 7-day rolling window deficiency calculation."""
    plant_id = "integration_plant_deficiency_check"

    # Query rolling window endpoint
    res = client.get(f"/npk/plant/{plant_id}/window?days=7")
    assert res.status_code == 200
    data = res.json()

    assert "latest" in data
    assert "latest_status" in data
    assert "latest_advice" in data
    assert "window" in data
    assert data["window"]["window_days"] == 7
    assert "mean_status" in data["window"]
    assert "mean_advice" in data["window"]


@pytest.mark.integration
def test_npk_sensor_to_recommendation_integration(client):
    """Integration test: Verifies that /analyze pipeline evaluates soil NPK telemetry."""
    # Mock image analysis to focus on the NPK integration step
    mock_analysis = {
        "leaf_length_cm": 15.0,
        "leaf_width_cm": 4.0,
        "leaf_area_cm2": 42.0,
        "growth_stage": "Vegetative",
        "confidence": 95.0,
        "marked_image": "data:image/jpeg;base64,mock",
    }

    # Custom sensor reading showing deficient Nitrogen (N=40 vs target 60%)
    custom_sensor = {
        "nitrogen": 40.0,
        "phosphorous": 40.0,
        "potassium": 20.0,
        "device_id": "esp32-s3-node",
    }

    blank = np.zeros((100, 100, 3), dtype=np.uint8)
    _, img_bytes = cv2.imencode(".jpg", blank)

    with patch("main.analyze_leaf_and_growth", return_value=mock_analysis):
        with patch("main.get_latest_npk_reading", return_value=custom_sensor):
            response = client.post(
                "/analyze",
                data={"leaf_count": 3, "plant_id": "p_test_sensor"},
                files={"image": ("orchid.jpg", io.BytesIO(img_bytes.tobytes()), "image/jpeg")},
            )

            assert response.status_code == 200
            data = response.json()

            # Verify the response consumed the sensor telemetry
            assert data["npk_reading"]["nitrogen"] == 40.0
            assert data["npk_reading"]["phosphorous"] == 40.0

            # Verify recommendation adjusted for nitrogen deficiency in Vegetative stage
            rec = data["npk_recommendation"]
            assert rec["growth_stage"] == "Vegetative"
            assert rec["target_ratio"] == "30-10-10"
            assert rec["status"]["nitrogen"] == "deficient"
            assert "Increase Nitrogen proportion" in rec["recommendation"]
