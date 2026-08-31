import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from utils.auth import get_current_user


def _create_mock_supabase(data=None, count=None):
    """Helper to create a chainable supabase mock."""
    mock = MagicMock()
    mock_res = MagicMock()
    mock_res.data = data if data is not None else []
    mock_res.count = count if count is not None else (len(data) if data is not None else 0)

    for method in ("select", "insert", "update", "delete", "eq", "is_", "order", "range", "limit", "gte", "lte"):
        getattr(mock.table.return_value, method).return_value = mock.table.return_value

    mock.table.return_value.execute.return_value = mock_res
    return mock


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
        mock_sb = _create_mock_supabase(
            data=[
                {"record_id": "rec-1", "weeks": 8, "plant_id": "plant-1"},
                {"record_id": "rec-2", "weeks": 4, "plant_id": "plant-2"},
            ]
        )
        mock_supabase.table = mock_sb.table

        response = client.get("/api/bloom")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["record_id"] == "rec-1"

    @patch("routers.bloom.supabase")
    def test_get_bloom_predictions_by_plant_paginated(self, mock_supabase, client):
        """Fetch paginated bloom history for a specific plant."""
        mock_sb = _create_mock_supabase(
            data=[{"record_id": "rec-p1", "weeks": 6, "plant_id": "plant-xyz"}],
            count=1,
        )
        mock_supabase.table = mock_sb.table

        response = client.get("/api/bloom/plant/plant-xyz?page=1&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert data["total"] == 1
        assert data["page"] == 1
        assert data["limit"] == 10
        assert data["data"][0]["record_id"] == "rec-p1"

    @patch("routers.bloom.supabase")
    def test_create_manual_bloom_prediction(self, mock_supabase, client):
        mock_sb = _create_mock_supabase(
            data=[{"record_id": "rec-new", "weeks": 6, "plant_id": "plant-xyz"}]
        )
        mock_supabase.table = mock_sb.table

        payload = {"weeks": 6, "plant_id": "plant-xyz"}
        response = client.post("/api/bloom", json=payload)
        assert response.status_code == 201
        assert response.json()["weeks"] == 6

    @patch("routers.bloom.supabase")
    def test_delete_bloom_prediction(self, mock_supabase, client):
        mock_sb = _create_mock_supabase(
            data=[{"record_id": "rec-del"}]
        )
        mock_supabase.table = mock_sb.table

        response = client.delete("/api/bloom/rec-del")
        assert response.status_code == 200
        assert "soft deleted successfully" in response.json()["message"]
