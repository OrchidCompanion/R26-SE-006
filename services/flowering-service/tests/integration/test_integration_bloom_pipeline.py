import io
from unittest.mock import MagicMock, patch
import cv2
import numpy as np
import pytest
from PIL import Image


def _create_synthetic_orchid_image() -> io.BytesIO:
    """Helper creating synthetic orchid foliage JPEG image."""
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.circle(arr, (50, 50), 35, (34, 139, 34), -1)  # Forest Green

    pil_img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


@pytest.mark.integration
def test_bloom_pipeline_health_check(client):
    """Integration test: Service health endpoints / and /health return 200 OK."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    root_data = res_root.json()
    assert "Orchid" in root_data["service"]
    assert root_data["status"] == "healthy"

    res_health = client.get("/health")
    assert res_health.status_code == 200
    health_data = res_health.json()
    assert "Orchid" in health_data["service"]
    assert health_data["status"] == "healthy"
    assert "mqtt_enabled" in health_data


@pytest.mark.integration
def test_bloom_pipeline_empty_images_bad_request(client):
    """Integration test: Submitting /predict without 3 images triggers 400 Bad Request."""
    res = client.post(
        "/predict",
        data={"user_id": "usr_int_01", "plant_id": "orchid_int_01"},
        files={},
    )
    assert res.status_code == 400
    assert "3 images are required" in res.json()["detail"].lower()


@pytest.mark.integration
def test_bloom_pipeline_multi_angle_prediction_flow(client):
    """Integration test: Multi-angle upload to /predict executes consensus, timeline, and telemetry."""
    img1 = _create_synthetic_orchid_image()
    img2 = _create_synthetic_orchid_image()
    img3 = _create_synthetic_orchid_image()

    mock_db_stats = {
        "count": 10,
        "avg_temp_c": 27.5,
        "min_temp_c": 25.0,
        "max_temp_c": 30.0,
        "temp_std_c": 1.5,
        "avg_humidity_rh": 72.0,
        "min_humidity_rh": 68.0,
        "max_humidity_rh": 78.0,
        "humidity_std_rh": 3.0,
        "avg_light_lux": 22000.0,
        "min_light_lux": 18000.0,
        "max_light_lux": 26000.0,
        "light_std_lux": 2500.0,
    }

    # Simulate stage detector returning Bud_formation for the angles
    with patch(
        "main.predict_single_image_stage",
        return_value=("Bud_formation", 0.92, True, None),
    ):
        with patch("main.get_sensor_statistics", return_value=mock_db_stats):
            with patch(
                "main.save_prediction_history",
                return_value={"id": 101, "plant_id": "orchid_bloom_01"},
            ):
                res = client.post(
                    "/predict",
                    data={
                        "user_id": "user_bloom_test",
                        "plant_id": "orchid_bloom_01",
                    },
                    files={
                        "image1": ("angle1.jpg", img1, "image/jpeg"),
                        "image2": ("angle2.jpg", img2, "image/jpeg"),
                        "image3": ("angle3.jpg", img3, "image/jpeg"),
                    },
                )

                assert res.status_code == 200
                data = res.json()

                # Verify core bloom prediction payload
                assert data["stage"] == "Bud_formation"
                assert data["confidence"] > 0.0
                assert data["total_days_to_flowering"] >= 0.0
                assert isinstance(data["timeline"], list)
                assert len(data["timeline"]) >= 1
                assert data["timeline"][0]["from_stage"] == "Bud_formation"
                assert data["timeline"][0]["to_stage"] == "Flowering"

                # Verify multi-angle analysis breakdown
                assert "image_predictions" in data
                assert len(data["image_predictions"]) == 3
                assert data["image_predictions"][0]["stage"] == "Bud_formation"

                # Verify environmental assessment
                assert "environment_evaluation" in data
                assert "recommendation" in data["environment_evaluation"]


@pytest.mark.integration
def test_bloom_pipeline_environmental_heat_stress_advisory(client):
    """Integration test: Bloom pipeline generates targeted advisory under heat stress."""
    img1 = _create_synthetic_orchid_image()
    img2 = _create_synthetic_orchid_image()
    img3 = _create_synthetic_orchid_image()

    mock_db_stats = {
        "count": 10,
        "avg_temp_c": 35.5,  # Extreme heat
        "min_temp_c": 33.0,
        "max_temp_c": 38.0,
        "temp_std_c": 1.5,
        "avg_humidity_rh": 50.0,  # Low humidity
        "min_humidity_rh": 45.0,
        "max_humidity_rh": 55.0,
        "humidity_std_rh": 3.0,
        "avg_light_lux": 42000.0,  # Harsh sunlight
        "min_light_lux": 35000.0,
        "max_light_lux": 48000.0,
        "light_std_lux": 2500.0,
    }

    with patch(
        "main.predict_single_image_stage",
        return_value=("Vegetative", 0.88, True, None),
    ):
        with patch("main.get_sensor_statistics", return_value=mock_db_stats):
            with patch("main.save_prediction_history", return_value={"id": 102}):
                res = client.post(
                    "/predict",
                    data={
                        "user_id": "user_heat_test",
                        "plant_id": "orchid_heat_01",
                    },
                    files={
                        "image1": ("orchid1.jpg", img1, "image/jpeg"),
                        "image2": ("orchid2.jpg", img2, "image/jpeg"),
                        "image3": ("orchid3.jpg", img3, "image/jpeg"),
                    },
                )

                assert res.status_code == 200
                data = res.json()
                advice = data["environment_evaluation"]["recommendation"].lower()

                # Verify botanical advice suggests cooling/shading
                assert any(word in advice for word in ["cooler", "shade", "water", "tray", "ventilated"])


@pytest.mark.integration
def test_bloom_pipeline_history_and_record_lifecycle(client):
    """Integration test: Querying plant history and record soft-deletion."""
    mock_plant_records = {
        "page": 1,
        "limit": 10,
        "total": 1,
        "data": [
            {
                "id": "rec_001",
                "plant_id": "orchid_history_01",
                "user_id": "user_history_01",
                "current_stage": "Bud_formation",
                "confidence": 91.5,
                "total_days_to_flowering": 14.0,
            }
        ],
    }
    mock_user_records = [
        {
            "id": "rec_001",
            "plant_id": "orchid_history_01",
            "user_id": "user_history_01",
            "current_stage": "Bud_formation",
            "confidence": 91.5,
            "total_days_to_flowering": 14.0,
        }
    ]

    with patch("main.get_plant_prediction_history", return_value=mock_plant_records):
        res_plant = client.get("/plant/orchid_history_01")
        assert res_plant.status_code == 200
        data = res_plant.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["plant_id"] == "orchid_history_01"

    with patch("main.get_user_prediction_history", return_value=mock_user_records):
        res_history = client.get("/history?user_id=user_history_01")
        assert res_history.status_code == 200
        assert len(res_history.json()) == 1

    with patch("main.soft_delete_prediction_history", return_value=True):
        res_del = client.delete("/rec_001")
        assert res_del.status_code == 200
        assert "message" in res_del.json()
