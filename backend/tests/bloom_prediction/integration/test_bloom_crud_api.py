import sys
from pathlib import Path
from unittest.mock import patch
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


class TestBloomCrudIntegrationAPI:
    """INTEGRATION TESTS: Testing bloom predictions database CRUD operations and history fetching."""

    @patch("routers.bloom.supabase")
    def test_get_all_bloom_predictions(self, mock_supabase, client):
        """Fetch all bloom predictions for current user."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.is_.return_value.order.return_value.execute.return_value.data = [
            {"record_id": "rec-1", "weeks": 8, "plant_id": "plant-1"},
            {"record_id": "rec-2", "weeks": 4, "plant_id": "plant-2"},
        ]

        response = client.get("/api/bloom")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["record_id"] == "rec-1"

    @patch("routers.bloom.supabase")
    def test_get_bloom_predictions_by_plant_paginated(self, mock_supabase, client):
        """Fetch paginated bloom history for a specific plant."""
        mock_res = mock_supabase.table.return_value.select.return_value.eq.return_value.is_.return_value.order.return_value.range.return_value.execute.return_value
        mock_res.data = [{"record_id": "rec-p1", "weeks": 6, "plant_id": "plant-xyz"}]
        mock_res.count = 1

        response = client.get("/api/bloom/plant/plant-xyz?page=1&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert data["total"] == 1
        assert data["page"] == 1
        assert data["limit"] == 10
        assert data["data"][0]["record_id"] == "rec-p1"

    @patch("routers.bloom.supabase")
    def test_get_bloom_prediction_by_id_success(self, mock_supabase, client):
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
            {"record_id": "rec-single", "weeks": 5, "plant_id": "p-1"}
        ]
        response = client.get("/api/bloom/rec-single")
        assert response.status_code == 200
        assert response.json()["record_id"] == "rec-single"

    @patch("routers.bloom.supabase")
    def test_get_bloom_prediction_by_id_not_found(self, mock_supabase, client):
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = []
        response = client.get("/api/bloom/rec-nonexistent")
        assert response.status_code == 404

    @patch("routers.bloom.supabase")
    def test_create_manual_bloom_prediction(self, mock_supabase, client):
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
            {"record_id": "rec-new", "weeks": 6, "plant_id": "plant-xyz"}
        ]

        payload = {"weeks": 6, "plant_id": "plant-xyz"}
        response = client.post("/api/bloom", json=payload)
        assert response.status_code == 201
        assert response.json()["weeks"] == 6

    @patch("routers.bloom.supabase")
    def test_update_bloom_prediction_success(self, mock_supabase, client):
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
            {"record_id": "rec-upd", "weeks": 10, "plant_id": "p-1"}
        ]
        response = client.put("/api/bloom/rec-upd", json={"weeks": 10})
        assert response.status_code == 200
        assert response.json()["weeks"] == 10

    def test_update_bloom_prediction_empty_payload_rejected(self, client):
        response = client.put("/api/bloom/rec-upd", json={})
        assert response.status_code == 400

    @patch("routers.bloom.supabase")
    def test_delete_bloom_prediction(self, mock_supabase, client):
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
            {"record_id": "rec-del"}
        ]
        response = client.delete("/api/bloom/rec-del")
        assert response.status_code == 200
        assert "soft deleted successfully" in response.json()["message"]
