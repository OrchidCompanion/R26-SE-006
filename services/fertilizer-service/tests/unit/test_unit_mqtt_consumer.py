import json
from unittest.mock import MagicMock, patch
import pytest
from mqtt_consumer import on_message, on_connect


def test_on_message_standard_keys():
    """Verify standard nitrogen, phosphorus, potassium payload parsing."""
    with patch("mqtt_consumer.save_npk_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/sensors/npk"
        msg.payload = json.dumps({
            "plant_id": "orchid_001",
            "user_id": "usr_999",
            "nitrogen": 140.5,
            "phosphorus": 45.0,
            "potassium": 195.2,
            "module_id": "esp32-node-1"
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            nitrogen=140.5,
            phosphorus=45.0,
            potassium=195.2,
            plant_id="orchid_001",
            user_id="usr_999",
            module_id="esp32-node-1",
        )


def test_on_message_alternative_keys():
    """Verify alternative N, P, K and device_id payload keys."""
    with patch("mqtt_consumer.save_npk_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/telemetry/npk"
        msg.payload = json.dumps({
            "N": 120.0,
            "P": 35.0,
            "K": 180.0,
            "device_id": "hardware-sensor-b"
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            nitrogen=120.0,
            phosphorus=35.0,
            potassium=180.0,
            plant_id=None,
            user_id=None,
            module_id="hardware-sensor-b",
        )


def test_on_message_extract_ids_from_topic():
    """Verify fallback user_id and plant_id extraction from MQTT topic path."""
    with patch("mqtt_consumer.save_npk_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/user_abc/plant_xyz/npk"
        msg.payload = json.dumps({
            "nitrogen_n": 155.0,
            "phosphorus_p": 50.0,
            "potassium_k": 210.0,
        }).encode("utf-8")

        on_message(None, None, msg)

        mock_save.assert_called_once_with(
            nitrogen=155.0,
            phosphorus=50.0,
            potassium=210.0,
            plant_id="plant_xyz",
            user_id="user_abc",
            module_id=None,
        )


def test_on_message_handles_malformed_json_gracefully():
    """Verify bad/corrupted payload bytes do not raise unhandled exceptions."""
    with patch("mqtt_consumer.save_npk_reading") as mock_save:
        msg = MagicMock()
        msg.topic = "orchid/sensors/npk"
        msg.payload = b"not-a-valid-json-string"

        # Should log error and not crash
        on_message(None, None, msg)
        mock_save.assert_not_called()


def test_on_connect_subscribes_on_success():
    """Verify subscriptions are registered when rc == 0."""
    client = MagicMock()
    on_connect(client, None, {}, 0)
    assert client.subscribe.call_count >= 5


def test_on_connect_does_not_subscribe_on_error():
    """Verify subscriptions are not registered when rc != 0."""
    client = MagicMock()
    on_connect(client, None, {}, 1)
    client.subscribe.assert_not_called()
