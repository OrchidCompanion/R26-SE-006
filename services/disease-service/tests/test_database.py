from unittest.mock import MagicMock, patch

import database as db


def test_get_user_diagnoses_empty_user_id():
    assert db.get_user_diagnoses("") == []
    assert db.get_user_diagnoses(None) == []


def test_get_plant_diagnoses_empty_plant_id():
    result = db.get_plant_diagnoses("")
    assert result["data"] == []
    assert result["total"] == 0


def test_npk_window_fallback_when_fertilizer_unreachable():
    with patch("database.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value.get.side_effect = ConnectionError("down")
        pack = db.get_npk_window_for_plant(plant_id="plant-1", user_id="user-1")

    assert pack["rows"] == []
    assert pack["latest"]["N"] is None
    assert pack["window"]["sample_size"] == 0
    assert pack["window"]["mean"]["N"] is None
    assert pack["window"]["days"] == 7
    assert "unavailable" in pack["latest_advice"][0].lower() or "No soil" in pack["window"]["deficiency_msg"]


def test_npk_window_passes_through_fertilizer_payload():
    body = {
        "rows": [{"nitrogen_n": 47}],
        "latest": {"N": 47, "P": 155, "K": 148, "time": "t"},
        "latest_status": {"N": "ok", "P": "high", "K": "high"},
        "latest_advice": ["Nitrogen OK"],
        "window": {"mean": {"N": 47.0, "P": 155.0, "K": 148.0}, "sample_size": 36},
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = body

    with patch("database.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value.get.return_value = mock_resp
        pack = db.get_npk_window_for_plant(plant_id="plant-1", user_id="u1", days=7)

    assert pack["window"]["mean"]["N"] == 47.0
    assert pack["window"]["sample_size"] == 36
    get_call = client_cls.return_value.__enter__.return_value.get
    args, kwargs = get_call.call_args
    assert "/npk/plant/plant-1/window" in args[0]
    assert kwargs["params"]["days"] == 7
    assert kwargs["params"]["user_id"] == "u1"


def test_save_npk_reading_forwards_json_on_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.json.return_value = {"reading_id": "r1"}

    with patch("database.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value.post.return_value = mock_resp
        saved = db.save_npk_reading(10, 20, 30, plant_id="p1", user_id="u1")

    assert saved["reading_id"] == "r1"
    post = client_cls.return_value.__enter__.return_value.post
    payload = post.call_args.kwargs["json"]
    assert payload["nitrogen_n"] == 10.0
    assert payload["plant_id"] == "p1"


def test_save_npk_reading_returns_none_on_error():
    with patch("database.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value.post.side_effect = RuntimeError("timeout")
        assert db.save_npk_reading(1, 2, 3) is None
