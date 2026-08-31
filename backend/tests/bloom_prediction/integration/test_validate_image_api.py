import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from utils.auth import get_current_user


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "email": "tester@example.com",
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


class TestValidateImageIntegrationAPI:
    """INTEGRATION TESTS: Testing /api/bloom/validate-image single-photo verification endpoint."""

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    def test_validate_single_valid_orchid(self, mock_post, client):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "image_predictions": [
                {
                    "filename": "orchid.jpg",
                    "stage": "Flowering",
                    "confidence": 0.94,
                    "is_valid": True,
                    "is_orchid": True,
                    "error": None,
                }
            ]
        }
        mock_post.return_value = mock_resp

        files = {"image": ("orchid.jpg", b"fake_bytes", "image/jpeg")}
        data = {"slot": "slot1"}

        response = client.post("/api/bloom/validate-image", data=data, files=files)
        assert response.status_code == 200
        res = response.json()
        assert res["is_orchid"] is True
        assert res["is_valid"] is True
        assert res["stage"] == "Flowering"
        assert res["confidence"] == 0.94

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    def test_validate_single_invalid_non_orchid(self, mock_post, client):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "image_predictions": [
                {
                    "filename": "document.jpg",
                    "stage": "Invalid",
                    "confidence": 0.0,
                    "is_valid": False,
                    "is_orchid": False,
                    "error": "Document or ID card detected.",
                }
            ]
        }
        mock_post.return_value = mock_resp

        files = {"image": ("document.jpg", b"fake_bytes", "image/jpeg")}
        data = {"slot": "slot2"}

        response = client.post("/api/bloom/validate-image", data=data, files=files)
        assert response.status_code == 200
        res = response.json()
        assert res["is_orchid"] is False
        assert res["is_valid"] is False
        assert res["stage"] == "Invalid"
