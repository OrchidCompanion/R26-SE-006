import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def mock_ml_models_for_unit_tests():
    """Mock ML model preloading during unit tests for speed."""
    with patch("model_service.load_fertilizer_models"):
        yield


@pytest.fixture
def client():
    """FastAPI TestClient fixture for unit tests."""
    from main import app
    with TestClient(app) as test_client:
        yield test_client
