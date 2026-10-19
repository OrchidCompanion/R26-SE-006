def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert "YOLO" in body["ensemble_models"][0]


def test_analyze_rejects_empty_upload(client):
    res = client.post(
        "/analyze",
        data={"plant_id": "plant-1"},
        files={"image": ("leaf.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400
    assert "Empty" in res.json()["detail"]


def test_analyze_rejects_invalid_image(client):
    res = client.post(
        "/analyze",
        data={"plant_id": "plant-1"},
        files={"image": ("leaf.jpg", b"not-an-image", "image/jpeg")},
    )
    assert res.status_code == 422


def test_analyze_returns_disease_and_npk_window(
    client, monkeypatch, jpeg_bytes, ensemble_black_rot, npk_pack
):
    monkeypatch.setattr("main.predict_disease_ensemble", lambda img: ensemble_black_rot)
    monkeypatch.setattr("main.get_npk_window_for_plant", lambda **kwargs: npk_pack)
    monkeypatch.setattr("main.save_diagnosis", lambda payload: {"analysis_id": "a1"})

    res = client.post(
        "/analyze",
        data={"plant_id": "plant-1", "user_id": "user-1"},
        files={"image": ("leaf.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "DISEASE"
    assert body["disease_name"] == "Black Rot"
    assert body["confidence"] == 81.0
    assert body["npk_window"]["mean"]["N"] == 47.0
    assert body["npk_window"]["mean"]["P"] == 155.0
    assert body["record"]["analysis_id"] == "a1"
    assert "Remove infected tissue" in body["treatment"][0]


def test_analyze_healthy_when_below_threshold(client, monkeypatch, jpeg_bytes, npk_pack):
    pred = {
        "predicted_class": "black_rot",
        "confidence": 0.4,
        "yolo": None,
        "mobilenet": {},
        "cnn": {},
        "ensemble_probs": [],
        "result_image": "x",
    }
    monkeypatch.setattr("main.predict_disease_ensemble", lambda img: pred)
    monkeypatch.setattr("main.get_npk_window_for_plant", lambda **kwargs: npk_pack)
    monkeypatch.setattr("main.save_diagnosis", lambda payload: None)

    res = client.post(
        "/analyze",
        data={"plant_id": "p1"},
        files={"image": ("leaf.jpg", jpeg_bytes, "image/jpeg")},
    )
    body = res.json()
    assert body["verdict"] == "HEALTHY"
    assert "below threshold" in body["verdict_msg"]


def test_history_requires_user_id(client):
    res = client.get("/history")
    assert res.status_code == 400


def test_history_returns_user_records(client, monkeypatch):
    monkeypatch.setattr("main.get_user_diagnoses", lambda user_id: [{"user_id": user_id}])
    res = client.get("/history", params={"user_id": "u1"})
    assert res.status_code == 200
    assert res.json()[0]["user_id"] == "u1"


def test_get_diagnosis_not_found(client, monkeypatch):
    monkeypatch.setattr("main.get_diagnosis_by_id", lambda analysis_id: None)
    res = client.get("/missing-id")
    assert res.status_code == 404


def test_delete_diagnosis_not_found(client, monkeypatch):
    monkeypatch.setattr("main.soft_delete_diagnosis", lambda analysis_id: False)
    res = client.delete("/missing-id")
    assert res.status_code == 404


def test_npk_history_endpoint(client, monkeypatch, npk_pack):
    monkeypatch.setattr("main.get_npk_window_for_plant", lambda *a, **k: npk_pack)
    res = client.get("/plant/plant-1/npk-history")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["days"] == 7
    assert body["window"]["mean"]["K"] == 148.0
