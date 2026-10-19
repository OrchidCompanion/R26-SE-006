"""Stub heavy ML deps so unit tests do not load TensorFlow or YOLO."""

import io
import sys
from unittest.mock import MagicMock

import pytest

for _mod in ("tensorflow", "tensorflow.keras", "ultralytics", "cv2"):
    sys.modules.setdefault(_mod, MagicMock())

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.load_disease_models", lambda: None)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def jpeg_bytes():
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(20, 80, 20)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def ensemble_black_rot():
    return {
        "predicted_class": "black_rot",
        "confidence": 0.81,
        "yolo": {"class_name": "black_rot", "confidence": 0.77, "box": [1, 2, 3, 4]},
        "mobilenet": {"class_name": "black_rot", "confidence": 0.85},
        "cnn": {"class_name": "bacterial_brown_spot", "confidence": 0.52},
        "ensemble_probs": [0.05, 0.81, 0.10, 0.04],
        "result_image": "abc123",
    }


@pytest.fixture
def npk_pack():
    mean = {"N": 47.0, "P": 155.0, "K": 148.0, "time": None}
    return {
        "rows": [{"nitrogen_n": 47.0, "phosphorus_p": 155.0, "potassium_k": 148.0}],
        "latest": mean,
        "latest_status": {"N": "ok", "P": "high", "K": "high"},
        "latest_advice": ["Nitrogen OK", "Reduce phosphorus application", "Leach cocopeat with water"],
        "window": {
            "sample_size": 36,
            "days": 7,
            "mean": {"N": 47.0, "P": 155.0, "K": 148.0},
            "mean_status": {"N": "ok", "P": "high", "K": "high"},
            "mean_advice": ["Nitrogen OK", "Reduce phosphorus application", "Leach cocopeat with water"],
            "has_deficiency": False,
            "deficient_nutrients": [],
            "excess_nutrients": ["Phosphorus", "Potassium"],
            "deficiency_msg": "Excess detected: Phosphorus, Potassium.",
        },
    }
