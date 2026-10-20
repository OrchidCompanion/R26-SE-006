import json
from unittest.mock import MagicMock, patch
import pytest

from mqtt_consumer import on_connect, on_message, start_mqtt_subscriber

pytestmark = pytest.mark.unit



def test_on_connect_subscribes_on_success():
    """Verify topic subscriptions are registered when rc == 0."""
    client = MagicMock()
    on_connect(client, None, {}, 0)

    # Subscribes to 3 environmental telemetry topics
    assert client.subscribe.call_count == 3
    subscribed_topics = [call[0][0] for call in client.subscribe.call_args_list]
    assert "orchid/+/+/env" in subscribed_topics
    assert "orchid/sensors/env" in subscribed_topics
    assert "orchid/telemetry/env" in subscribed_topics


def test_on_connect_does_not_subscribe_on_error():
    """Verify subscription does not happen when return code is non-zero."""
    client = MagicMock()
    on_connect(client, None, {}, 5)
    client.subscribe.assert_not_called()


def test_on_message_standard_keys():
    """Verify parsing standard temperature, humidity, light, plant_id, and user_id."""
    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/sensors/env"
        msg.payload = json.dumps({
            "temperature": 27.8,
            "humidity": 73.2,
            "light": 21500.0,
            "plant_id": "orchid-101",
            "user_id": "usr-555",
            "module_id": "esp32-node-1",
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            temperature=27.8,
            humidity=73.2,
            light=21500.0,
            plant_id="orchid-101",
            module_id="esp32-node-1",
            user_id="usr-555",
        )


def test_on_message_alternative_keys():
    """Verify alternative keys (temp, hum, lux, mac_address) are recognized."""
    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/telemetry/env"
        msg.payload = json.dumps({
            "temp": 26.5,
            "hum": 71.0,
            "lux": 19800.0,
            "mac_address": "30:AE:A4:01:23:45",
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            temperature=26.5,
            humidity=71.0,
            light=19800.0,
            plant_id=None,
            module_id="30:AE:A4:01:23:45",
            user_id=None,
        )


def test_on_message_extract_ids_from_topic_path():
    """Verify user_id and plant_id extraction from topic orchid/{user_id}/{plant_id}/env."""
    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/usr_alpha/plant_beta/env"
        msg.payload = json.dumps({
            "temperature": 28.0,
            "humidity": 74.0,
            "light": 22000.0,
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            temperature=28.0,
            humidity=74.0,
            light=22000.0,
            plant_id="plant_beta",
            module_id=None,
            user_id="usr_alpha",
        )


def test_on_message_ignores_sensors_keyword_in_topic_for_user_id():
    """Verify topic containing 'sensors' does not treat 'sensors' as user_id."""
    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/sensors/plant_gamma/env"
        msg.payload = json.dumps({
            "temperature": 27.0,
            "humidity": 72.0,
            "light": 20000.0,
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            temperature=27.0,
            humidity=72.0,
            light=20000.0,
            plant_id="plant_gamma",
            module_id=None,
            user_id=None,
        )


def test_on_message_handles_malformed_json_gracefully():
    """Verify corrupted bytes do not crash the subscriber."""
    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/sensors/env"
        msg.payload = b"not-a-valid-json-string"

        # Should log exception and safely return without raising
        on_message(None, None, msg)
        mock_save.assert_not_called()


def test_on_message_handles_database_exception_gracefully():
    """Verify exception in save_sensor_reading does not crash subscriber."""
    with patch("mqtt_consumer.save_sensor_reading", side_effect=RuntimeError("Save failed")):
        msg = MagicMock()
        msg.topic = "orchid/sensors/env"
        msg.payload = json.dumps({"temperature": 25.0, "humidity": 70.0, "light": 18000.0}).encode("utf-8")

        # Must not raise
        on_message(None, None, msg)


def test_start_mqtt_subscriber_disabled_by_config():
    """Verify subscriber thread is not launched when ENABLE_MQTT is false."""
    with patch("mqtt_consumer.ENABLE_MQTT", False):
        with patch("threading.Thread") as mock_thread:
            start_mqtt_subscriber()
            mock_thread.assert_not_called()


def test_start_mqtt_subscriber_when_paho_mqtt_missing():
    """Verify subscriber safely exits when mqtt library is None."""
    with patch("mqtt_consumer.ENABLE_MQTT", True):
        with patch("mqtt_consumer.mqtt", None):
            with patch("threading.Thread") as mock_thread:
                start_mqtt_subscriber()
                mock_thread.assert_not_called()


def test_start_mqtt_subscriber_starts_background_thread():
    """Verify background daemon thread is started when enabled."""
    with patch("mqtt_consumer.ENABLE_MQTT", True):
        with patch("mqtt_consumer.mqtt", MagicMock()):
            with patch("threading.Thread") as mock_thread:
                start_mqtt_subscriber()
                mock_thread.assert_called_once()
                mock_thread.return_value.start.assert_called_once()
