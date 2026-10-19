import io
import cv2
import numpy as np
import pytest
from unittest.mock import patch, MagicMock


def test_health_check_endpoints(client):
    """Test / and /health endpoints."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "healthy"

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"


def test_analyze_leaf_count_validation(client):
    """Verify Form validation rejects leaf_count < 1."""
    fake_img = io.BytesIO(b"fake image bytes")
    response = client.post(
        "/analyze",
        data={"leaf_count": 0},
        files={"image": ("test.jpg", fake_img, "image/jpeg")},
    )
    assert response.status_code == 422


def test_analyze_empty_image_upload(client):
    """Verify empty image upload returns 400."""
    response = client.post(
        "/analyze",
        data={"leaf_count": 2},
        files={"image": ("test.jpg", io.BytesIO(b""), "image/jpeg")},
    )
    assert response.status_code == 400
    assert "Empty image" in response.json()["detail"]


def test_analyze_undecodable_image(client):
    """Verify corrupted non-image bytes return 422."""
    response = client.post(
        "/analyze",
        data={"leaf_count": 2},
        files={"image": ("test.jpg", io.BytesIO(b"not-an-image"), "image/jpeg")},
    )
    assert response.status_code == 422
    assert "Could not decode" in response.json()["detail"]


def test_analyze_leaf_not_detected_returns_error(client):
    """Verify 422 status and descriptive error message when a leaf is not detected."""
    blank_img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", blank_img)
    img_bytes = io.BytesIO(encoded.tobytes())

    with patch(
        "main.analyze_leaf_and_growth",
        side_effect=ValueError("Leaf not detected. Please ensure an orchid leaf is clearly visible in the image.")
    ):
        response = client.post(
            "/analyze",
            data={"leaf_count": 3},
            files={"image": ("orchid.jpg", img_bytes, "image/jpeg")},
        )
        assert response.status_code == 422
        assert "Leaf not detected" in response.json()["detail"]



def test_analyze_successful_flow(client):
    """Test full /analyze pipeline with mocked CV/model and DB layers."""
    # Create valid synthetic JPEG image bytes
    blank_img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", blank_img)
    img_bytes = io.BytesIO(encoded.tobytes())

    mock_analysis = {
        "leaf_length_cm": 12.5,
        "leaf_width_cm": 3.2,
        "leaf_area_cm2": 32.1,
        "growth_stage": "Vegetative",
        "confidence": 92.5,
        "marked_image": "data:image/jpeg;base64,mockbase64",
    }
    mock_npk = {"nitrogen": 180.0, "phosphorous": 50.0, "potassium": 210.0, "device_id": "esp32-s3"}
    mock_saved = {"id": "req-123", "growth_stage": "Vegetative"}

    with patch("main.analyze_leaf_and_growth", return_value=mock_analysis):
        with patch("main.get_latest_npk_reading", return_value=mock_npk):
            with patch("main.save_fertilizer_requirement", return_value=mock_saved):
                response = client.post(
                    "/analyze",
                    data={"leaf_count": 4, "plant_id": "p-01", "user_id": "u-01"},
                    files={"image": ("orchid.jpg", img_bytes, "image/jpeg")},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["growth_stage"] == "Vegetative"
                assert data["leaf_count"] == 4
                assert data["confidence"] == pytest.approx(0.925, 0.01)
                assert "npk_recommendation" in data
                assert "target_ratio" in data["npk_recommendation"]


def test_create_requirement(client):
    """Test POST /requirements."""
    mock_record = {"id": "req-999", "fertilizer": "NPK 20-20-20"}
    with patch("main.save_fertilizer_requirement", return_value=mock_record):
        payload = {
            "fertilizer": "NPK 20-20-20",
            "qty": 2.0,
            "unit": "scoop",
            "plant_id": "orchid-42",
        }
        res = client.post("/requirements", json=payload, headers={"X-User-Id": "usr-88"})
        assert res.status_code == 201
        assert res.json()["id"] == "req-999"


def test_get_user_requirements_missing_user_id(client):
    """Test GET /requirements fails without user identification."""
    res = client.get("/requirements")
    assert res.status_code == 400


def test_get_user_requirements_success(client):
    """Test GET /requirements returns records when user_id is provided."""
    with patch("main.get_user_fertilizer_requirements", return_value=[{"id": "req-1"}]):
        res = client.get("/requirements?user_id=usr-123")
        assert res.status_code == 200
        assert len(res.json()) == 1


def test_get_requirement_by_id_not_found(client):
    """Test GET /{record_id} 404 when requirement does not exist."""
    with patch("main.get_fertilizer_requirement_by_id", return_value=None):
        res = client.get("/non-existent-id")
        assert res.status_code == 404


def test_delete_requirement_success(client):
    """Test DELETE /{record_id} succeeds."""
    with patch("main.soft_delete_fertilizer_requirement", return_value=True):
        res = client.delete("/req-to-delete")
        assert res.status_code == 200
        assert "deleted successfully" in res.json()["message"]


def test_log_npk_json_reading(client):
    """Test POST /npk json ingestion."""
    mock_saved = {"id": "npk-1", "nitrogen": 140.0}
    with patch("main.save_npk_reading", return_value=mock_saved):
        payload = {
            "nitrogen_n": 140.0,
            "phosphorus_p": 45.0,
            "potassium_k": 200.0,
            "plant_id": "plant-7",
        }
        res = client.post("/npk", json=payload)
        assert res.status_code == 201
        assert res.json()["id"] == "npk-1"
