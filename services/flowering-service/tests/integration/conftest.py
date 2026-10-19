import pytest
from fastapi.testclient import TestClient

# Backward-compatibility shim for unpickling scikit-learn models across versions
try:
    import sklearn.compose._column_transformer as ct
    if not hasattr(ct, "_RemainderColsList"):
        ct._RemainderColsList = type("_RemainderColsList", (list,), {})
except Exception:
    pass

from model_service import load_bloom_models


@pytest.fixture(scope="session", autouse=True)
def preload_real_ml_models():
    """Ensure real ML model files are preloaded for integration testing."""
    try:
        load_bloom_models()
    except Exception:
        pass
    yield


@pytest.fixture
def client():
    """FastAPI TestClient fixture for integration tests."""
    from main import app
    with TestClient(app) as test_client:
        yield test_client
