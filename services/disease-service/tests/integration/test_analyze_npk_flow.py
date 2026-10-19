"""
Integration tests: FastAPI analyze/history + real NPK client (httpx mocked as fertilizer-service).
ML weights are still stubbed — TensorFlow is not required.
"""

from unittest.mock import MagicMock, patch

import pytest

FERTILIZER_WINDOW = {
    "rows": [{"nitrogen_n": 47.0, "phosphorus_p": 155.0, "potassium_k": 148.0}],
    "latest": {"N": 47.0, "P": 155.0, "K": 148.0, "time": "2026-10-19T00:00:00Z"},
    "latest_status": {"N": "ok", "P": "high", "K": "high"},
    "latest_advice": [
        "Nitrogen OK",
        "Reduce phosphorus application",
        "Leach cocopeat with water",
    ],
    "window": {
        "sample_size": 36,
        "days": 7,
        "mean": {"N": 47.0, "P": 155.0, "K": 148.0},
        "mean_status": {"N": "ok", "P": "high", "K": "high"},
        "mean_advice": [
            "Nitrogen OK",
            "Reduce phosphorus application",
            "Leach cocopeat with water",
        ],
        "has_deficiency": False,
        "deficient_nutrients": [],
        "excess_nutrients": ["Phosphorus", "Potassium"],
        "deficiency_msg": "Excess detected: Phosphorus, Potassium.",
    },
}


def _mock_fertilizer_get(status_code=200, body=None, error=None):
    client_cls = MagicMock()
    inner = MagicMock()
    if error:
        inner.get.side_effect = error
    else:
        resp = MagicMock()
        resp.status_code = status_code
        resp.json.return_value = body if body is not None else FERTILIZER_WINDOW
        inner.get.return_value = resp
    client_cls.return_value.__enter__.return_value = inner
    return client_cls, inner


@pytest.mark.integration
def test_analyze_uses_real_npk_client_and_returns_window(
    client, monkeypatch, jpeg_bytes, ensemble_black_rot
):
    monkeypatch.setattr("main.predict_disease_ensemble", lambda img: ensemble_black_rot)
    monkeypatch.setattr("main.save_diagnosis", lambda payload: {"analysis_id": "int-1", **payload})

    client_cls, inner = _mock_fertilizer_get()
    with patch("database.httpx.Client", client_cls):
        res = client.post(
            "/api/disease/analyze",
            data={"plant_id": "plant-int-1", "user_id": "user-int-1"},
            files={"image": ("leaf.jpg", jpeg_bytes, "image/jpeg")},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "DISEASE"
    assert body["disease_name"] == "Black Rot"
    assert body["npk"]["N"] == 47.0
    assert body["npk_window"]["mean"]["P"] == 155.0
    assert body["npk_window"]["sample_size"] == 36
    assert body["record"]["plant_id"] == "plant-int-1"
    get_args = inner.get.call_args
    assert "plant-int-1" in get_args[0][0]
    assert get_args.kwargs["params"]["user_id"] == "user-int-1"


@pytest.mark.integration
def test_analyze_falls_back_when_fertilizer_is_down(
    client, monkeypatch, jpeg_bytes, ensemble_black_rot
):
    monkeypatch.setattr("main.predict_disease_ensemble", lambda img: ensemble_black_rot)
    monkeypatch.setattr("main.save_diagnosis", lambda payload: None)

    client_cls, _ = _mock_fertilizer_get(error=ConnectionError("fertilizer down"))
    with patch("database.httpx.Client", client_cls):
        res = client.post(
            "/analyze",
            data={"plant_id": "plant-int-2"},
            files={"image": ("leaf.jpg", jpeg_bytes, "image/jpeg")},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "DISEASE"
    assert body["npk"]["N"] is None
    assert body["npk_window"]["sample_size"] == 0
    assert body["npk_window"]["mean"]["K"] is None


@pytest.mark.integration
def test_npk_history_endpoint_uses_fertilizer_window(client):
    client_cls, _ = _mock_fertilizer_get()
    with patch("database.httpx.Client", client_cls):
        res = client.get("/plant/plant-int-1/npk-history", params={"user_id": "u1"})

    assert res.status_code == 200
    body = res.json()
    assert body["days"] == 7
    assert body["total"] == 1
    assert body["window"]["mean"]["N"] == 47.0


@pytest.mark.integration
def test_plant_history_can_include_npk_window(client, monkeypatch):
    monkeypatch.setattr(
        "main.get_plant_diagnoses",
        lambda plant_id, page=1, limit=10: {
            "data": [{"analysis_id": "a1", "plant_id": plant_id}],
            "total": 1,
            "page": page,
            "limit": limit,
        },
    )
    client_cls, _ = _mock_fertilizer_get()
    with patch("database.httpx.Client", client_cls):
        res = client.get("/plant/plant-int-1", params={"include_npk": True, "user_id": "u1"})

    assert res.status_code == 200
    body = res.json()
    assert body["data"][0]["analysis_id"] == "a1"
    assert body["npk_window"]["mean"]["K"] == 148.0
    assert body["days"] == 7


@pytest.mark.integration
def test_npk_reading_forwards_to_fertilizer(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.json.return_value = {"reading_id": "npk-1"}
    client_cls = MagicMock()
    inner = MagicMock()
    inner.post.return_value = mock_resp
    client_cls.return_value.__enter__.return_value = inner

    with patch("database.httpx.Client", client_cls):
        res = client.post(
            "/npk-reading",
            data={
                "nitrogen": "12",
                "phosphorus": "20",
                "potassium": "80",
                "plant_id": "p1",
                "user_id": "u1",
            },
        )

    assert res.status_code == 200
    assert res.json()["record"]["reading_id"] == "npk-1"
    payload = inner.post.call_args.kwargs["json"]
    assert payload["nitrogen_n"] == 12.0
    assert payload["plant_id"] == "p1"
