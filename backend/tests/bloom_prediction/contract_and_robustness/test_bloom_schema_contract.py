import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import HTTPException, status
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


class TestBloomSchemaContractAndRobustness:
    """CONTRACT & ROBUSTNESS TESTS: Testing schema contracts, data types, and fault tolerance."""

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    @patch("routers.bloom.supabase")
    def test_response_schema_contract(
        self, mock_supabase, mock_fetch_telemetry, mock_post, client
    ):
        """Strict schema verification of the predicted bloom JSON contract."""
        mock_fetch_telemetry.return_value = {
            "avg_temp_c": 26.5,
            "min_temp_c": 24.0,
            "max_temp_c": 29.0,
            "temp_std_c": 1.1,
            "avg_humidity_rh": 71.5,
            "min_humidity_rh": 68.0,
            "max_humidity_rh": 74.0,
            "humidity_std_rh": 1.5,
            "avg_light_lux": 21000.0,
            "min_light_lux": 17000.0,
            "max_light_lux": 25000.0,
            "light_std_lux": 1800.0,
            "data_window_days": 30,
            "telemetry_samples_count": 90,
            "location_id": "loc-contract",
            "plant_name": "Dendrobium Classic",
        }

        ml_res = {
            "status": "success",
            "current_stage": "Vegetative",
            "confidence": 89,
            "total_days_to_flowering": 60.0,
            "image_predictions": [
                {"is_orchid": True, "is_valid": True, "stage": "Vegetative", "confidence": 0.89, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Vegetative", "confidence": 0.89, "error": None},
                {"is_orchid": True, "is_valid": True, "stage": "Vegetative", "confidence": 0.89, "error": None},
            ],
            "timeline": [
                {"from_stage": "Vegetative", "to_stage": "Mature_Pseudobulb", "transition_days": 20.0, "cumulative_days": 20.0},
                {"from_stage": "Mature_Pseudobulb", "to_stage": "Bud_formation", "transition_days": 20.0, "cumulative_days": 40.0},
                {"from_stage": "Bud_formation", "to_stage": "Flowering", "transition_days": 20.0, "cumulative_days": 60.0},
            ],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value=ml_res)
        mock_post.return_value = mock_resp

        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{"id": "schema-1"}]

        files = {
            "image1": ("img1.jpg", b"fake1", "image/jpeg"),
            "image2": ("img2.jpg", b"fake2", "image/jpeg"),
            "image3": ("img3.jpg", b"fake3", "image/jpeg"),
        }
        data = {"plant_id": "33333333-3333-3333-3333-333333333333"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 200
        res = response.json()

        # 1. Top-Level Field Contracts
        assert isinstance(res["plant_id"], str)
        assert isinstance(res["weeks"], int)
        assert isinstance(res["current_stage"], str)
        assert isinstance(res["confidence"], int)
        assert isinstance(res["estimated_flowering_date"], str)
        assert isinstance(res["timeline"], list)
        assert isinstance(res["sensor_summary"], dict)
        assert isinstance(res["environment_evaluation"], dict)

        # 2. Environmental Evaluation Sub-Contract
        env = res["environment_evaluation"]
        assert env["temperature_status"] in ("Low", "Optimal", "High")
        assert env["humidity_status"] in ("Low", "Optimal", "High")
        assert env["light_status"] in ("Low", "Optimal", "High")
        assert isinstance(env["recommendation"], str)

        for factor in ("temperature", "humidity", "light"):
            f = env[factor]
            assert isinstance(f["value"], (int, float))
            assert isinstance(f["target"], str)
            assert f["status"] in ("low", "optimal", "high")
            assert isinstance(f["status_label"], str)

        # 3. Explicit absence of stage-based care instructions
        assert "care_instructions" not in res
        assert "optimal_conditions" not in res

    @patch("httpx.AsyncClient.post", new_callable=AsyncMock)
    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    def test_non_orchid_images_raise_422_with_clear_message(self, mock_fetch_telemetry, mock_post, client):
        """When images contain invalid non-orchid content, return HTTP 422 with explanation."""
        mock_fetch_telemetry.return_value = {
            "avg_temp_c": 26.5,
            "min_temp_c": 24.0,
            "max_temp_c": 29.0,
            "temp_std_c": 1.1,
            "avg_humidity_rh": 71.5,
            "min_humidity_rh": 68.0,
            "max_humidity_rh": 74.0,
            "humidity_std_rh": 1.5,
            "avg_light_lux": 21000.0,
            "min_light_lux": 17000.0,
            "max_light_lux": 25000.0,
            "light_std_lux": 1800.0,
            "data_window_days": 30,
            "telemetry_samples_count": 90,
            "location_id": "loc-contract",
            "plant_name": "Dendrobium Classic",
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value={
            "status": "error",
            "message": "Non-orchid image detected in Angle 1. The AI model classified the photo as not an orchid (Invalid). Please re-upload clear photos of your Dendrobium orchid plant for all 3 angles to receive an accurate prediction.",
        })
        mock_post.return_value = mock_resp

        files = {
            "image1": ("card.jpg", b"fake1", "image/jpeg"),
            "image2": ("orchid1.jpg", b"fake2", "image/jpeg"),
            "image3": ("orchid2.jpg", b"fake3", "image/jpeg"),
        }
        data = {"plant_id": "33333333-3333-3333-3333-333333333333"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 422
        assert "Non-orchid image detected" in response.json()["detail"]

    @patch("routers.bloom._fetch_plant_sensor_telemetry")
    def test_missing_sensor_telemetry_raises_422(
        self, mock_fetch_telemetry, client
    ):
        """When no IoT sensor telemetry is recorded in Supabase, return HTTP 422 explaining requirement."""
        mock_fetch_telemetry.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No DHT11 temperature/humidity IoT telemetry recorded in Supabase for Dendrobium. Real-time IoT sensor data is required."
        )

        files = {
            "image1": ("img1.jpg", b"fake1", "image/jpeg"),
            "image2": ("img2.jpg", b"fake2", "image/jpeg"),
            "image3": ("img3.jpg", b"fake3", "image/jpeg"),
        }
        data = {"plant_id": "33333333-3333-3333-3333-333333333333"}

        response = client.post("/api/bloom/predict", data=data, files=files)
        assert response.status_code == 422
        assert "No DHT11 temperature/humidity IoT telemetry recorded" in response.json()["detail"]
