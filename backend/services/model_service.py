"""YOLO locate → crop → MobileNetV2 + CNN → weighted ensemble."""

from __future__ import annotations

import base64
import os
import threading
from typing import Any, Dict, List, Optional, Tuple

# Must be set before `import keras` (avoids broken TensorFlow on this machine).
os.environ.setdefault("KERAS_BACKEND", "torch")

import cv2
import numpy as np

CLASS_NAMES = ["bacterial_brown_spot", "black_rot", "healthy", "invalid"]

# YOLO is a localization prior; classifiers get more weight on the crop.
YOLO_WEIGHT = 0.25
MOBILENET_WEIGHT = 0.40
CNN_WEIGHT = 0.35

IMG_SIZE = 224
YOLO_CONF = 0.25
CROP_PAD = 0.12

COLORS = {
    "bacterial_brown_spot": (0, 140, 255),
    "black_rot": (0, 0, 255),
    "healthy": (0, 180, 0),
    "invalid": (128, 128, 128),
}

_keras_compat_applied = False


def _compat_keras_layer_kwargs() -> None:
    """Ignore newer Keras keys (e.g. quantization_config) when loading .keras files."""
    global _keras_compat_applied
    if _keras_compat_applied:
        return

    from keras.src.layers.core.dense import Dense
    from keras.src.layers.layer import Layer

    drop_keys = ("quantization_config", "lora_rank", "lora_alpha")

    def _wrap_init(orig):
        def _init(self, *args, **kwargs):
            for key in drop_keys:
                kwargs.pop(key, None)
            return orig(self, *args, **kwargs)

        return _init

    Layer.__init__ = _wrap_init(Layer.__init__)
    Dense.__init__ = _wrap_init(Dense.__init__)

    orig_from_config = Dense.from_config.__func__

    @classmethod
    def _from_config(cls, config):
        config = dict(config)
        for key in drop_keys:
            config.pop(key, None)
        return orig_from_config(cls, config)

    Dense.from_config = _from_config
    _keras_compat_applied = True


_lock = threading.Lock()
_yolo = None
_mobilenet = None
_cnn = None


def _repo_root() -> str:
    # backend/services/model_service.py → repo root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _models_dir() -> str:
    root = _repo_root()
    candidates = [
        os.path.join(root, "model_train_IT22190598", "models"),
        os.path.join(root, "model_train_IT22250124", "models"),
        os.path.join(os.path.dirname(__file__), "..", "models"),
    ]
    for path in candidates:
        abs_path = os.path.abspath(path)
        if os.path.isdir(abs_path):
            yolo = os.path.join(abs_path, "yolov26best.pt")
            mnet = os.path.join(abs_path, "MobileNetV2_best.keras")
            cnn = os.path.join(abs_path, "CNN_best.keras")
            if os.path.exists(yolo) and os.path.exists(mnet) and os.path.exists(cnn):
                return abs_path
    raise FileNotFoundError(
        "Disease models not found. Place yolov26best.pt, MobileNetV2_best.keras, "
        "and CNN_best.keras under model_train_IT22190598/models or model_train_IT22250124/models."
    )


def _load_models() -> None:
    global _yolo, _mobilenet, _cnn
    if _yolo is not None and _mobilenet is not None and _cnn is not None:
        return
    with _lock:
        if _yolo is not None and _mobilenet is not None and _cnn is not None:
            return
        # Keras 3 + PyTorch backend — avoids TensorFlow's Windows long-path install.
        os.environ.setdefault("KERAS_BACKEND", "torch")
        from keras.models import load_model
        from ultralytics import YOLO

        _compat_keras_layer_kwargs()

        models_dir = _models_dir()
        _yolo = YOLO(os.path.join(models_dir, "yolov26best.pt"))
        _mobilenet = load_model(
            os.path.join(models_dir, "MobileNetV2_best.keras"),
            compile=False,
        )
        _cnn = load_model(
            os.path.join(models_dir, "CNN_best.keras"),
            compile=False,
        )


def _prepare_classifier_input(bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA)
    x = resized.astype(np.float32) / 255.0
    return np.expand_dims(x, axis=0)


def _classify_crop(bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    x = _prepare_classifier_input(bgr)
    mnet_probs = np.asarray(_mobilenet.predict(x, verbose=0)[0], dtype=np.float32)
    cnn_probs = np.asarray(_cnn.predict(x, verbose=0)[0], dtype=np.float32)
    return mnet_probs, cnn_probs


def _expand_box(
    x1: int, y1: int, x2: int, y2: int, w: int, h: int, pad: float = CROP_PAD
) -> Tuple[int, int, int, int]:
    bw, bh = x2 - x1, y2 - y1
    px, py = int(bw * pad), int(bh * pad)
    nx1 = max(0, x1 - px)
    ny1 = max(0, y1 - py)
    nx2 = min(w, x2 + px)
    ny2 = min(h, y2 + py)
    if nx2 <= nx1 or ny2 <= ny1:
        return 0, 0, w, h
    return nx1, ny1, nx2, ny2


def _pick_yolo_box(result) -> Optional[Dict[str, Any]]:
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return None

    detections: List[Dict[str, Any]] = []
    for box in boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        xyxy = box.xyxy[0].cpu().numpy().tolist()
        name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else "invalid"
        detections.append(
            {
                "cls_id": cls_id,
                "class_name": name,
                "confidence": conf,
                "xyxy": xyxy,
            }
        )

    disease = [
        d
        for d in detections
        if d["class_name"] not in ("healthy", "invalid")
    ]
    pool = disease if disease else detections
    return max(pool, key=lambda d: d["confidence"])


def _to_one_hot(cls_id: int, conf: float, n: int) -> np.ndarray:
    vec = np.zeros(n, dtype=np.float32)
    if 0 <= cls_id < n:
        vec[cls_id] = float(np.clip(conf, 0.0, 1.0))
    return vec


def _annotate(img: np.ndarray, box: Optional[Dict[str, Any]], label: str, conf: float) -> np.ndarray:
    out = img.copy()
    color = COLORS.get(label, (255, 255, 255))
    if box is not None:
        x1, y1, x2, y2 = [int(v) for v in box["xyxy"]]
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        text = f"{label} {conf:.2f}"
        cv2.putText(out, text, (x1, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    else:
        cv2.putText(
            out,
            f"{label} {conf:.2f} (full leaf)",
            (12, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
        )
    return out


def _encode_jpeg_b64(bgr: np.ndarray) -> str:
    ok, buffer = cv2.imencode(".jpg", bgr)
    if not ok:
        raise RuntimeError("Failed to encode result image.")
    return base64.b64encode(buffer.tobytes()).decode("utf-8")


def ensemble_predict(image_bytes: bytes) -> Dict[str, Any]:
    """
    Run the full pipeline and return:
      predicted_class, confidence (0-1), per-model votes, annotated JPEG (base64).
    """
    _load_models()

    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode uploaded image.")

    h, w = img.shape[:2]
    results = _yolo.predict(source=img, conf=YOLO_CONF, verbose=False)
    result = results[0]
    yolo_box = _pick_yolo_box(result)

    if yolo_box is not None:
        x1, y1, x2, y2 = [int(v) for v in yolo_box["xyxy"]]
        x1, y1, x2, y2 = _expand_box(x1, y1, x2, y2, w, h)
        yolo_box["xyxy"] = [x1, y1, x2, y2]
        crop = img[y1:y2, x1:x2]
        yolo_vec = _to_one_hot(yolo_box["cls_id"], yolo_box["confidence"], len(CLASS_NAMES))
        yolo_weight = YOLO_WEIGHT
    else:
        crop = img
        yolo_vec = np.zeros(len(CLASS_NAMES), dtype=np.float32)
        yolo_weight = 0.0

    if crop.size == 0:
        crop = img

    mnet_probs, cnn_probs = _classify_crop(crop)

    acc = (
        yolo_vec * yolo_weight
        + mnet_probs * MOBILENET_WEIGHT
        + cnn_probs * CNN_WEIGHT
    )
    used = yolo_weight + MOBILENET_WEIGHT + CNN_WEIGHT
    ensemble = acc / used

    pred_id = int(np.argmax(ensemble))
    pred_class = CLASS_NAMES[pred_id]
    confidence = float(ensemble[pred_id])

    annotated = _annotate(img, yolo_box, pred_class, confidence)

    def pack(probs: np.ndarray) -> Dict[str, float]:
        return {CLASS_NAMES[i]: round(float(probs[i]), 4) for i in range(len(CLASS_NAMES))}

    yolo_pred = (
        {
            "class_name": yolo_box["class_name"],
            "confidence": round(float(yolo_box["confidence"]), 4),
            "box": yolo_box["xyxy"],
        }
        if yolo_box is not None
        else {"class_name": None, "confidence": 0.0, "box": None}
    )

    return {
        "predicted_class": pred_class,
        "confidence": confidence,
        "yolo": yolo_pred,
        "mobilenet": {
            "class_name": CLASS_NAMES[int(np.argmax(mnet_probs))],
            "confidence": round(float(np.max(mnet_probs)), 4),
            "probs": pack(mnet_probs),
        },
        "cnn": {
            "class_name": CLASS_NAMES[int(np.argmax(cnn_probs))],
            "confidence": round(float(np.max(cnn_probs)), 4),
            "probs": pack(cnn_probs),
        },
        "ensemble_probs": pack(ensemble),
        "result_image": _encode_jpeg_b64(annotated),
    }
