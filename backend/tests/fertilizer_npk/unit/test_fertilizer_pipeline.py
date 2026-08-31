import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from utils.auth import get_current_user


def override_get_current_user():
    return {"user_id": "test-user-123", "email": "test@example.com"}


app.dependency_overrides[get_current_user] = override_get_current_user
client = TestClient(app)


class TestFertilizerPipelineUnit:
    """UNIT & CONTRACT TESTS: Testing /api/fertilizer endpoints."""

    @pytest.fixture(autouse=True)
    def reset_overrides(self):
        app.dependency_overrides[get_current_user] = override_get_current_user
        yield

    @patch("routers.fertilizer.httpx.AsyncClient.post")
    @patch("routers.fertilizer.get_latest_npk_data")
    def test_fertilizer_analyze_success(self, mock_npk, mock_hf_post):
        """Test /api/fertilizer/analyze endpoint returns leaf metrics and NPK recommendation."""
        # Mock HF Response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "growth_stage": "Vegetative",
            "confidence": 95.4,
            "leaf_length_cm": 14.5,
            "leaf_width_cm": 3.8,
            "leaf_area_cm2": 42.1
        }
        mock_hf_post.return_value = mock_response

        # Mock NPK data
        mock_npk.return_value = {
            "nitrogen": 60.0,
            "phosphorous": 20.0,
            "potassium": 20.0,
            "device_id": "esp32-npk-test"
        }

        # Send test image + form fields
        fake_file = ("leaf.jpg", b"fake image bytes", "image/jpeg")
        response = client.post(
            "/api/fertilizer/analyze",
            data={"leaf_count": "2", "plant_id": "plant-99"},
            files={"image": fake_file}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["growth_stage"] == "Vegetative"
        assert data["leaf_count"] == 2
        assert data["leaf_length_cm"] == 14.5
        assert data["leaf_width_cm"] == 3.8
        assert data["leaf_area_cm2"] == 42.1
        assert data["confidence"] == pytest.approx(0.954)
        assert "npk_recommendation" in data
        assert data["npk_recommendation"]["target_ratio"] == "30-10-10"

    def test_fertilizer_analyze_missing_image(self):
        """Test /api/fertilizer/analyze fails with 422 if image file is omitted."""
        response = client.post(
            "/api/fertilizer/analyze",
            data={"leaf_count": "2"}
        )
        assert response.status_code == 422
