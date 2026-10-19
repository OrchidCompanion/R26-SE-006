import io
from unittest.mock import patch, MagicMock
import pytest
from PIL import Image


def _create_synthetic_jpeg_bytes() -> io.BytesIO:
    """Helper to generate valid JPEG image in memory."""
    img = Image.new("RGB", (60, 60), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def test_health_check_endpoints(client):
    """Test / and /health endpoints return 200 and healthy metadata."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "healthy"
    assert res_root.json()["service"] == "Orchid Flowering Lifecycle Service"

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"
    assert "mqtt_enabled" in res_health.json()


def test_predict_bloom_missing_images(client):
    """Verify 400 Bad Request when fewer than 3 images are uploaded."""
    # 0 images
    res0 = client.post("/predict", data={"plant_id": "orchid-01"})
    assert res0.status_code == 400
    assert "Exactly 3 images are required" in res0.json()["detail"]

    # 1 image
    res1 = client.post(
        "/predict",
        data={"plant_id": "orchid-01"},
        files={"image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")},
    )
    assert res1.status_code == 400
    assert "received 1" in res1.json()["detail"]

    # 2 images
    res2 = client.post(
        "/predict",
        data={"plant_id": "orchid-01"},
        files={
            "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
            "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        },
    )
    assert res2.status_code == 400
    assert "received 2" in res2.json()["detail"]


def test_predict_bloom_corrupted_image(client):
    """Verify 422 Unprocessable Entity when an uploaded image file is corrupted."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", io.BytesIO(b"not-a-valid-image"), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }
    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.90, True, None)):
        res = client.post("/predict", data={"plant_id": "orchid-01"}, files=files)
        assert res.status_code == 422
        assert "Non-orchid image detected in Angle 2" in res.json()["detail"]


def test_predict_bloom_non_orchid_botanical_check_fails(client):
    """Verify 422 when botanical feature validation rejects an angle."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    # Simulate Angle 3 failing orchid botanical validation
    side_effects = [
        ("Vegetative", 0.90, True, None),
        ("Vegetative", 0.88, True, None),
        ("Invalid", 0.0, False, "Non-orchid image detected"),
    ]

    with patch("main.predict_single_image_stage", side_effect=side_effects):
        res = client.post("/predict", data={"plant_id": "orchid-01"}, files=files)
        assert res.status_code == 422
        assert "Non-orchid image detected in Angle 3" in res.json()["detail"]


def test_predict_bloom_missing_sensor_telemetry(client):
    """Verify 422 when plant has no 30-day sensor telemetry recorded."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.92, True, None)):
        with patch("main.get_sensor_statistics", return_value=None):
            res = client.post("/predict", data={"plant_id": "orchid-01"}, files=files)
            assert res.status_code == 422
            assert "No environmental sensor data found" in res.json()["detail"]


def test_predict_bloom_successful_flow_vegetative(client):
    """Verify full prediction pipeline for Vegetative stage to Flowering."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    mock_sensor_stats = {
        "avg_temp_c": 27.2,
        "avg_humidity_rh": 72.8,
        "avg_light_lux": 21000.0,
        "telemetry_samples_count": 120,
    }

    mock_timeline = [
        {"from_stage": "Vegetative", "to_stage": "Mature_Pseudobulb", "transition_days": 20.0, "cumulative_days": 20.0},
        {"from_stage": "Mature_Pseudobulb", "to_stage": "Bud_formation", "transition_days": 12.0, "cumulative_days": 32.0},
        {"from_stage": "Bud_formation", "to_stage": "Flowering", "transition_days": 10.0, "cumulative_days": 42.0},
    ]

    mock_db_saved = {"id": "record-100", "plant_id": "plant-xyz"}

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.91, True, None)):
        with patch("main.get_sensor_statistics", return_value=mock_sensor_stats):
            with patch("main.forecast_blooming_timeline", return_value=(42.0, mock_timeline)):
                with patch("main.save_prediction_history", return_value=mock_db_saved):
                    res = client.post(
                        "/predict",
                        data={"plant_id": "plant-xyz", "user_id": "usr-42"},
                        files=files,
                    )

                    assert res.status_code == 200
                    data = res.json()
                    assert data["plant_id"] == "plant-xyz"
                    assert data["user_id"] == "usr-42"
                    assert data["current_stage"] == "Vegetative"
                    assert data["stage"] == "Vegetative"
                    assert data["confidence"] == 91
                    assert data["total_days_to_flowering"] == 42.0
                    assert data["display_total_days"] == 42
                    assert data["weeks"] == 6
                    assert data["total_days_range"] == "37–47"
                    assert "Estimated Flowering in 6 Weeks" in data["prediction_msg"]
                    assert len(data["image_predictions"]) == 3
                    assert len(data["timeline"]) == 3
                    assert "environment_evaluation" in data
                    assert data["record"]["id"] == "record-100"


def test_predict_bloom_successful_flow_currently_flowering(client):
    """Verify prediction pipeline when the orchid is already in full bloom."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    mock_sensor_stats = {
        "avg_temp_c": 26.5,
        "avg_humidity_rh": 73.0,
        "avg_light_lux": 22000.0,
        "telemetry_samples_count": 95,
    }

    with patch("main.predict_single_image_stage", return_value=("Flowering", 0.96, True, None)):
        with patch("main.get_sensor_statistics", return_value=mock_sensor_stats):
            with patch("main.forecast_blooming_timeline", return_value=(0.0, [])):
                with patch("main.save_prediction_history", return_value={"id": "rec-flowering"}):
                    res = client.post("/predict", data={"plant_id": "plant-bloom"}, files=files)

                    assert res.status_code == 200
                    data = res.json()
                    assert data["current_stage"] == "Flowering"
                    assert data["weeks"] == 0
                    assert data["total_days_min"] == 0
                    assert data["total_days_max"] == 0
                    assert data["total_days_range"] == "0 Days (Currently Flowering)"
                    assert data["estimated_flowering_date"] == "Currently in Bloom"
                    assert data["prediction_msg"] == "Your Dendrobium orchid is currently in full bloom!"


def test_predict_bloom_aliases_and_user_id_resolution(client):
    """Verify alternative routes /analyze and /api/bloom/predict and header X-User-Id fallback."""
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    mock_sensor = {"avg_temp_c": 27.0, "avg_humidity_rh": 72.0, "avg_light_lux": 20000.0, "telemetry_samples_count": 50}

    with patch("main.predict_single_image_stage", return_value=("Bud_formation", 0.88, True, None)):
        with patch("main.get_sensor_statistics", return_value=mock_sensor):
            with patch("main.forecast_blooming_timeline", return_value=(14.0, [])):
                with patch("main.save_prediction_history", return_value={"id": "alias-rec"}):
                    # Test /analyze with X-User-Id header
                    res_analyze = client.post(
                        "/analyze",
                        data={"plant_id": "plant-02"},
                        headers={"X-User-Id": "header-usr-99"},
                        files=files,
                    )
                    assert res_analyze.status_code == 200
                    assert res_analyze.json()["user_id"] == "header-usr-99"

                    # Reset file pointer for next call
                    files["image1"] = ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")
                    files["image2"] = ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")
                    files["image3"] = ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")

                    # Test /api/bloom/predict with anonymous fallback
                    res_api = client.post(
                        "/api/bloom/predict",
                        data={"plant_id": "plant-03"},
                        files=files,
                    )
                    assert res_api.status_code == 200
                    assert res_api.json()["user_id"] == "anonymous"


def test_validate_image_endpoint_valid_orchid(client):
    """Test /validate-image returns positive confirmation for orchid foliage."""
    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.89, True, None)):
        res = client.post(
            "/validate-image",
            data={"slot": "Angle 1"},
            files={"image": ("orchid.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["is_orchid"] is True
        assert data["is_valid"] is True
        assert data["stage"] == "Vegetative"
        assert data["confidence"] == 0.89
        assert data["slot"] == "Angle 1"


def test_validate_image_endpoint_invalid_orchid(client):
    """Test /validate-image returns false when non-orchid is detected."""
    with patch("main.predict_single_image_stage", return_value=("Invalid", 0.0, False, "Non-orchid image")):
        res = client.post(
            "/validate-image",
            files={"image": ("chair.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg")},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["is_orchid"] is False
        assert data["is_valid"] is False
        assert data["stage"] == "Invalid"
        assert data["error"] == "Non-orchid image"


def test_validate_image_endpoint_corrupted_file(client):
    """Test /validate-image safely handles corrupted unreadable bytes."""
    res = client.post(
        "/validate-image",
        files={"image": ("corrupted.jpg", io.BytesIO(b"garbage-data"), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_orchid"] is False
    assert data["is_valid"] is False
    assert data["stage"] == "Invalid"
    assert "error" in data


def test_sensor_reading_endpoint(client):
    """Test POST /sensor-reading ingests telemetry."""
    mock_saved = {"status": "success", "id": "sens-1"}
    with patch("main.save_sensor_reading", return_value=mock_saved):
        res = client.post(
            "/sensor-reading",
            data={
                "temperature": 27.5,
                "humidity": 72.0,
                "light": 21000.0,
                "plant_id": "orchid-77",
                "module_id": "esp32-node",
            },
            headers={"X-User-Id": "u-77"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "success"
        assert res.json()["record"]["id"] == "sens-1"


def test_get_plant_history_endpoint(client):
    """Test GET /plant/{plant_id} retrieves history records."""
    mock_history = {
        "data": [{"id": "rec-1", "current_stage": "Bud_formation"}],
        "total": 1,
        "page": 1,
        "limit": 10,
    }
    with patch("main.get_plant_prediction_history", return_value=mock_history):
        res = client.get("/plant/plant-abc?page=1&limit=10")
        assert res.status_code == 200
        assert res.json()["total"] == 1
        assert len(res.json()["data"]) == 1


def test_get_user_history_missing_user_id(client):
    """Test GET /history raises 400 when user_id is missing."""
    res = client.get("/history")
    assert res.status_code == 400
    assert "user_id query param or X-User-Id header required" in res.json()["detail"]


def test_get_user_history_with_query_param(client):
    """Test GET /history succeeds when user_id query param is supplied."""
    with patch("main.get_user_prediction_history", return_value=[{"id": "r-1"}, {"id": "r-2"}]):
        res = client.get("/history?user_id=usr-55")
        assert res.status_code == 200
        assert len(res.json()) == 2


def test_get_user_history_with_header(client):
    """Test GET /history succeeds when X-User-Id header is supplied."""
    with patch("main.get_user_prediction_history", return_value=[{"id": "r-3"}]):
        res = client.get("/history", headers={"X-User-Id": "usr-88"})
        assert res.status_code == 200
        assert len(res.json()) == 1


def test_delete_record_not_found(client):
    """Test DELETE /{record_id} raises 404 when record does not exist."""
    with patch("main.soft_delete_prediction_history", return_value=False):
        res = client.delete("/non-existent-rec")
        assert res.status_code == 404
        assert "Record not found" in res.json()["detail"]


def test_delete_record_success(client):
    """Test DELETE /{record_id} returns 200 upon successful soft deletion."""
    with patch("main.soft_delete_prediction_history", return_value=True):
        res = client.delete("/valid-rec-id")
        assert res.status_code == 200
        assert "soft deleted successfully" in res.json()["message"]
