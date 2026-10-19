import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

# Ensure fertilizer-service root is on sys.path
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


@pytest.fixture(autouse=True)
def disable_external_services(monkeypatch):
    """Disable MQTT subscriber and ML model preloading during tests."""
    monkeypatch.setenv("ENABLE_MQTT", "false")
    with patch("mqtt_consumer.start_mqtt_subscriber"):
        with patch("model_service.load_fertilizer_models"):
            yield


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as test_client:
        yield test_client
