import pytest
from fastapi.testclient import TestClient
from model_service import load_fertilizer_models


@pytest.fixture(scope="session", autouse=True)
def preload_real_ml_models():
    """Ensure real ML model files are preloaded for integration testing."""
    load_fertilizer_models()
    yield


@pytest.fixture
def client():
    """FastAPI TestClient fixture for integration tests."""
    from main import app
    with TestClient(app) as test_client:
        yield test_client
