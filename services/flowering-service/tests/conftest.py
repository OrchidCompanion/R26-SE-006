import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
# pyrefly: ignore[missing-import]
import pytest

# Ensure flowering-service root is on sys.path
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


@pytest.fixture(autouse=True)
def disable_mqtt(monkeypatch):
    """Disable MQTT subscriber background thread across all tests."""
    monkeypatch.setenv("ENABLE_MQTT", "false")
    with patch("mqtt_consumer.start_mqtt_subscriber"):
        yield

