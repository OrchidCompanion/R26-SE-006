from unittest.mock import MagicMock, patch

import mqtt_consumer


def test_on_message_reads_nested_topic_and_payload_aliases():
    msg = MagicMock()
    msg.topic = "orchid/user-1/plant-9/npk"
    msg.payload = b'{"nitrogen_n": 11, "phosphorus_p": 22, "potassium_k": 33}'

    with patch("mqtt_consumer.save_npk_reading") as save:
        mqtt_consumer.on_message(None, None, msg)

    save.assert_called_once()
    kwargs = save.call_args.kwargs
    assert kwargs["user_id"] == "user-1"
    assert kwargs["plant_id"] == "plant-9"
    assert kwargs["nitrogen"] == 11.0
    assert kwargs["phosphorus"] == 22.0
    assert kwargs["potassium"] == 33.0


def test_on_message_prefers_payload_ids_over_topic():
    msg = MagicMock()
    msg.topic = "orchid/sensors/npk"
    msg.payload = b'{"user_id": "u2", "plant_id": "p2", "N": 1, "P": 2, "K": 3}'

    with patch("mqtt_consumer.save_npk_reading") as save:
        mqtt_consumer.on_message(None, None, msg)

    kwargs = save.call_args.kwargs
    assert kwargs["user_id"] == "u2"
    assert kwargs["plant_id"] == "p2"


def test_on_message_swallows_bad_json():
    msg = MagicMock()
    msg.topic = "orchid/u/p/npk"
    msg.payload = b"not-json"

    with patch("mqtt_consumer.save_npk_reading") as save:
        mqtt_consumer.on_message(None, None, msg)

    save.assert_not_called()
