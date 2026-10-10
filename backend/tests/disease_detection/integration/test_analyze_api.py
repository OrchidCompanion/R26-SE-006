import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tests.disease_detection.conftest import OWNER_ID, PLANT_ID, chain_supabase, seven_day_rows


def _pred(predicted_class="bacterial_brown_spot", confidence=0.7808):
    return {
        "predicted_class": predicted_class,
        "confidence": confidence,
        "result_image": "ZmFrZQ==",
        "yolo": {"class_name": predicted_class, "confidence": confidence, "box": [1, 2, 10, 10]},
        "mobilenet": {"class_name": predicted_class, "confidence": confidence},
        "cnn": {"class_name": predicted_class, "confidence": confidence},
        "ensemble_probs": {},
    }


def _async_client(payload, status_code=200):
    response = MagicMock()
    response.status_code = status_code
    response.text = "ml-error" if status_code >= 400 else "{}"
    response.json.return_value = payload
    if status_code >= 400:
        request = MagicMock()
        response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "ml failed", request=request, response=response
        )
    else:
        response.raise_for_status = MagicMock()

    inner = AsyncMock()
    inner.post = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=inner)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


class TestDiseaseAnalyzeIntegrationAPI:
    """INTEGRATION TESTS: POST /api/disease/analyze with mocked ML service + supabase."""

    def test_analyze_rejects_empty_image(self, client):
        response = client.post(
            "/api/disease/analyze",
            data={"plant_id": PLANT_ID},
            files={"image": ("leaf.jpg", b"", "image/jpeg")},
        )
        assert response.status_code == 400
        assert "Empty image" in response.json()["detail"]

    def test_analyze_requires_image(self, client):
        response = client.post("/api/disease/analyze", data={"plant_id": PLANT_ID})
        assert response.status_code == 422

    @patch("routers.disease.supabase")
    @patch("routers.disease.httpx.AsyncClient")
    def test_analyze_bacterial_brown_spot(self, mock_ac, mock_sb, client):
        mock_ac.return_value = _async_client(_pred("bacterial_brown_spot", 0.7808))
        mock_sb.table.side_effect = chain_supabase(
            {
                "npk_history": seven_day_rows(),
                "plants": [{"user_id": OWNER_ID}],
                "disease_analysis": [{"analysis_id": "a1", "verdict": "DISEASE"}],
            }
        ).table.side_effect

        response = client.post(
            "/api/disease/analyze",
            data={"plant_id": PLANT_ID},
            files={"image": ("leaf.jpg", b"fake-bytes", "image/jpeg")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verdict"] == "DISEASE"
        assert data["disease_name"] == "Bacterial Brown Spot"
        assert data["confidence"] == 78.08
        assert any("hydrogen peroxide" in t.lower() for t in data["treatment"])
        assert data["ensemble"]["predicted_class"] == "bacterial_brown_spot"
        assert "npk_window" in data
        assert data["result_image"] == "ZmFrZQ=="

    @patch("routers.disease.supabase")
    @patch("routers.disease.httpx.AsyncClient")
    def test_analyze_low_confidence_treated_as_healthy(self, mock_ac, mock_sb, client):
        mock_ac.return_value = _async_client(_pred("black_rot", 0.40))
        mock_sb.table.side_effect = chain_supabase(
            {
                "npk_history": seven_day_rows(),
                "plants": [{"user_id": OWNER_ID}],
                "disease_analysis": [{"analysis_id": "a2"}],
            }
        ).table.side_effect

        response = client.post(
            "/api/disease/analyze",
            data={"plant_id": PLANT_ID},
            files={"image": ("leaf.jpg", b"fake-bytes", "image/jpeg")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verdict"] == "HEALTHY"
        assert "below 60% threshold" in data["verdict_msg"]

    @patch("routers.disease.supabase")
    @patch("routers.disease.httpx.AsyncClient")
    def test_analyze_healthy_leaf(self, mock_ac, mock_sb, client):
        mock_ac.return_value = _async_client(_pred("healthy", 0.92))
        mock_sb.table.side_effect = chain_supabase(
            {
                "npk_history": seven_day_rows(),
                "plants": [{"user_id": OWNER_ID}],
                "disease_analysis": [{"analysis_id": "a3"}],
            }
        ).table.side_effect

        response = client.post(
            "/api/disease/analyze",
            data={"plant_id": PLANT_ID},
            files={"image": ("leaf.jpg", b"fake-bytes", "image/jpeg")},
        )
        data = response.json()
        assert response.status_code == 200
        assert data["verdict"] == "HEALTHY"
        assert data["disease_name"] == "Healthy"
        assert "healthy" in data["verdict_msg"].lower()

    @patch("routers.disease.httpx.AsyncClient")
    def test_analyze_ml_service_http_error(self, mock_ac, client):
        mock_ac.return_value = _async_client({}, status_code=502)
        response = client.post(
            "/api/disease/analyze",
            data={"plant_id": PLANT_ID},
            files={"image": ("leaf.jpg", b"fake-bytes", "image/jpeg")},
        )
        assert response.status_code == 502
        assert "ML Service Error" in response.json()["detail"]
