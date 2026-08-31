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


class TestBloomPredictionIntegrationAPI:
    """INTEGRATION TESTS: Testing /api/bloom/predict end-to-end endpoint with mocked ML pipeline."""

    def test_predict_rejects_incomplete_angles(self, client):
        """Must reject requests with fewer than 3 images with HTTP 400."""
        files = {
            "image1": ("front.jpg", b"fake_bytes_1", "image/jpeg"),
            "image2": ("side1.jpg", b"fake_bytes_2", "image/jpeg"),
        }
        data = {"plant_id": "22222222-2222-2222-2222-222222222222"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 400
        assert "Exactly 3 images are required" in response.json()["detail"]

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    @patch("routers.bloom.supabase")
    def test_predict_full_multi_step_simulation(
        self, mock_supabase, mock_fetch_telemetry, mock_post, client
    ):
        """Full pipeline: Seedling detected -> forecasts all steps until Flowering."""
        mock_fetch_telemetry.return_value = {
            "avg_temp_c": 28.0,
            "min_temp_c": 26.0,
            "max_temp_c": 30.0,
            "temp_std_c": 1.0,
            "avg_humidity_rh": 72.0,
            "min_humidity_rh": 70.0,
            "max_humidity_rh": 74.0,
            "humidity_std_rh": 1.1,
            "avg_light_lux": 24000.0,
            "min_light_lux": 20000.0,
            "max_light_lux": 28000.0,
            "light_std_lux": 1500.0,
            "data_window_days": 30,
            "telemetry_samples_count": 60,
            "location_id": "loc-123",
            "plant_name": "Dendrobium Sonia",
        }

        ml_res = {
            "status": "success",
            "current_stage": "Seedling",
            "confidence": 88,
            "total_days_to_flowering": 84.0,
            "image_predictions": [
                {"is_orchid": True, "is_valid": True, "stage": "Seedling", "confidence": 0.90, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Seedling", "confidence": 0.85, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Seedling", "confidence": 0.88, "error": None},
            ],
            "timeline": [
                {"from_stage": "Seedling", "to_stage": "Vegetative", "transition_days": 21.0, "cumulative_days": 21.0},
                {"from_stage": "Vegetative", "to_stage": "Mature_Pseudobulb", "transition_days": 21.0, "cumulative_days": 42.0},
                {"from_stage": "Mature_Pseudobulb", "to_stage": "Bud_formation", "transition_days": 21.0, "cumulative_days": 63.0},
                {"from_stage": "Bud_formation", "to_stage": "Flowering", "transition_days": 21.0, "cumulative_days": 84.0},
            ],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value=ml_res)
        mock_post.return_value = mock_resp

        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "pred-seedling-1", "weeks": 12}
        ]

        files = {
            "image1": ("front.jpg", b"fake_bytes_1", "image/jpeg"),
            "image2": ("side1.jpg", b"fake_bytes_2", "image/jpeg"),
            "image3": ("side2.jpg", b"fake_bytes_3", "image/jpeg"),
        }
        data = {"plant_id": "22222222-2222-2222-2222-222222222222"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 200
        data_out = response.json()

        assert data_out["stage"] == "Seedling"
        assert len(data_out["timeline"]) == 4
        assert data_out["timeline"][0]["from_stage"] == "Seedling"
        assert data_out["timeline"][0]["to_stage"] == "Vegetative"
        assert data_out["timeline"][3]["from_stage"] == "Bud_formation"
        assert data_out["timeline"][3]["to_stage"] == "Flowering"

        assert data_out["weeks"] == 12
        assert data_out["environment_evaluation"]["temperature_status"] == "Optimal"

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    @patch("routers.bloom.supabase")
    def test_predict_terminal_flowering_stage(
        self, mock_supabase, mock_fetch_telemetry, mock_post, client
    ):
        """When orchid is already flowering, return 0 transition days and 'Currently in Bloom'."""
        mock_fetch_telemetry.return_value = {
            "avg_temp_c": 27.0,
            "min_temp_c": 25.0,
            "max_temp_c": 29.0,
            "temp_std_c": 1.0,
            "avg_humidity_rh": 72.0,
            "min_humidity_rh": 70.0,
            "max_humidity_rh": 74.0,
            "humidity_std_rh": 1.0,
            "avg_light_lux": 22000.0,
            "min_light_lux": 18000.0,
            "max_light_lux": 26000.0,
            "light_std_lux": 1200.0,
            "data_window_days": 30,
            "telemetry_samples_count": 50,
            "location_id": "loc-456",
            "plant_name": "Dendrobium Emma",
        }

        ml_res = {
            "status": "success",
            "current_stage": "Flowering",
            "confidence": 92,
            "total_days_to_flowering": 0.0,
            "image_predictions": [
                {"is_orchid": True, "is_valid": True, "stage": "Flowering", "confidence": 0.95, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Flowering", "confidence": 0.92, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Flowering", "confidence": 0.89, "error": None},
            ],
            "timeline": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value=ml_res)
        mock_post.return_value = mock_resp

        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "pred-flowering", "weeks": 0}
        ]

        files = {
            "image1": ("front.jpg", b"fake_bytes_1", "image/jpeg"),
            "image2": ("side1.jpg", b"fake_bytes_2", "image/jpeg"),
            "image3": ("side2.jpg", b"fake_bytes_3", "image/jpeg"),
        }
        data = {"plant_id": "22222222-2222-2222-2222-222222222222"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 200
        data_out = response.json()

        assert data_out["stage"] == "Flowering"
        assert data_out["weeks"] == 0
        assert data_out["total_days_to_flowering"] == 0.0
        assert len(data_out["timeline"]) == 0
        assert "currently in full bloom" in data_out["prediction_msg"].lower()

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    @patch("routers.bloom.supabase")
    def test_predict_confidence_weighted_voting_resolution(
        self, mock_supabase, mock_fetch_telemetry, mock_post, client
    ):
        """Test multi-angle voting when angle predictions differ."""
        mock_fetch_telemetry.return_value = {
            "avg_temp_c": 27.0,
            "min_temp_c": 25.0,
            "max_temp_c": 29.0,
            "temp_std_c": 1.0,
            "avg_humidity_rh": 72.0,
            "min_humidity_rh": 70.0,
            "max_humidity_rh": 74.0,
            "humidity_std_rh": 1.0,
            "avg_light_lux": 22000.0,
            "min_light_lux": 18000.0,
            "max_light_lux": 26000.0,
            "light_std_lux": 1200.0,
            "data_window_days": 30,
            "telemetry_samples_count": 50,
            "location_id": "loc-456",
            "plant_name": "Dendrobium Emma",
        }

        ml_res = {
            "status": "success",
            "current_stage": "Bud_formation",
            "confidence": 83,
            "total_days_to_flowering": 10.0,
            "image_predictions": [
                {"is_orchid": True, "is_valid": True, "stage": "Bud_formation", "confidence": 0.80, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Mature_Pseudobulb", "confidence": 0.75, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Bud_formation", "confidence": 0.85, "error": None},
            ],
            "timeline": [
                {"from_stage": "Bud_formation", "to_stage": "Flowering", "transition_days": 10.0, "cumulative_days": 10.0}
            ],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value=ml_res)
        mock_post.return_value = mock_resp

        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{"id": "pred-vote"}]

        files = {
            "image1": ("front.jpg", b"fake_bytes_1", "image/jpeg"),
            "image2": ("side1.jpg", b"fake_bytes_2", "image/jpeg"),
            "image3": ("side2.jpg", b"fake_bytes_3", "image/jpeg"),
        }
        data = {"plant_id": "22222222-2222-2222-2222-222222222222"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 200
        data_out = response.json()

        assert data_out["stage"] == "Bud_formation"
        assert data_out["confidence"] in (82, 83)
        assert len(data_out["image_predictions"]) == 3
