import io
import base64
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import numpy as np
from PIL import Image
import cv2
import tensorflow as tf
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

DISEASE_CLASSES = ["bacterial_brown_spot", "black_rot", "healthy", "invalid"]

_yolo_model: Optional[YOLO] = None
_mobilenet_model: Optional[tf.keras.Model] = None
_cnn_model: Optional[tf.keras.Model] = None


def load_disease_models() -> Tuple[YOLO, tf.keras.Model, tf.keras.Model]:
    global _yolo_model, _mobilenet_model, _cnn_model
    if _yolo_model is None:
        p_yolo = MODELS_DIR / "disease_yolo.pt"
        if not p_yolo.exists():
            raise FileNotFoundError(f"Missing {p_yolo}")
        print(f"[ModelService] Loading YOLO model from {p_yolo}...")
        _yolo_model = YOLO(str(p_yolo))

    if _mobilenet_model is None or _cnn_model is None:
        p_mb = MODELS_DIR / "disease_mobilenetv2.keras"
        p_cnn = MODELS_DIR / "disease_custom_cnn.keras"
        if not p_mb.exists() or not p_cnn.exists():
            raise FileNotFoundError(f"Missing keras models: {p_mb} or {p_cnn}")

        print(f"[ModelService] Loading MobileNetV2 from {p_mb}...")
        _mobilenet_model = tf.keras.models.load_model(str(p_mb))

        print(f"[ModelService] Loading Custom CNN from {p_cnn}...")
        _cnn_model = tf.keras.models.load_model(str(p_cnn))

    return _yolo_model, _mobilenet_model, _cnn_model


def predict_disease_ensemble(pil_img: Image.Image) -> Dict[str, Any]:
    """
    Executes the multi-stage ensemble pipeline:
    1. YOLO locates and boxes the disease lesion.
    2. The lesion crop is fed into MobileNetV2 and Custom CNN.
    3. Probabilities are fused using a 0.55/0.45 weighted ensemble.
    4. An annotated visualization is returned in base64.
    """
    yolo_model, mobilenet_model, cnn_model = load_disease_models()

    # 1. YOLO Detection & Cropping
    yolo_res = yolo_model.predict(source=pil_img, conf=0.25, imgsz=640, verbose=False)[0]
    boxes = yolo_res.boxes

    crop_img = pil_img
    yolo_det = None

    if boxes is not None and len(boxes) > 0:
        confs = boxes.conf.cpu().numpy()
        best_i = int(np.argmax(confs))
        box = boxes[best_i]
        xyxy = box.xyxy[0].cpu().numpy().astype(int)
        cls_id = int(box.cls[0])
        cls_name = yolo_model.names.get(cls_id, str(cls_id))
        yolo_det = {
            "class_name": cls_name,
            "confidence": float(confs[best_i]),
            "box": [int(x) for x in xyxy],
        }

        # Crop detected region for fine-grained classifiers
        w, h = pil_img.size
        x1, y1, x2, y2 = max(0, xyxy[0]), max(0, xyxy[1]), min(w, xyxy[2]), min(h, xyxy[3])
        if (x2 - x1) > 10 and (y2 - y1) > 10:
            crop_img = pil_img.crop((x1, y1, x2, y2))

    # 2. Preprocess crop for MobileNetV2 and CNN (224x224, normalized to [0, 1])
    crop_resized = crop_img.resize((224, 224))
    crop_arr = np.array(crop_resized, dtype=np.float32) / 255.0
    crop_batch = np.expand_dims(crop_arr, axis=0)

    # 3. MobileNetV2 Inference
    mb_probs = mobilenet_model.predict(crop_batch, verbose=0)[0]
    mb_top_idx = int(np.argmax(mb_probs))
    mobilenet_det = {
        "class_name": DISEASE_CLASSES[mb_top_idx] if mb_top_idx < len(DISEASE_CLASSES) else str(mb_top_idx),
        "confidence": float(mb_probs[mb_top_idx]),
        "probabilities": [round(float(p), 4) for p in mb_probs],
    }

    # 4. Custom CNN Inference
    cnn_probs = cnn_model.predict(crop_batch, verbose=0)[0]
    cnn_top_idx = int(np.argmax(cnn_probs))
    cnn_det = {
        "class_name": DISEASE_CLASSES[cnn_top_idx] if cnn_top_idx < len(DISEASE_CLASSES) else str(cnn_top_idx),
        "confidence": float(cnn_probs[cnn_top_idx]),
        "probabilities": [round(float(p), 4) for p in cnn_probs],
    }

    # 5. Weighted Ensemble Fusion (55% MobileNetV2 + 45% Custom CNN)
    ensemble_probs = 0.55 * mb_probs + 0.45 * cnn_probs
    top_class_idx = int(np.argmax(ensemble_probs))
    final_class = (
        DISEASE_CLASSES[top_class_idx]
        if top_class_idx < len(DISEASE_CLASSES)
        else str(top_class_idx)
    )
    final_conf = float(ensemble_probs[top_class_idx])

    # 6. Generate Annotated Bounding Box Image
    annotated_bgr = yolo_res.plot()
    annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])
    buf = io.BytesIO()
    annotated_rgb.save(buf, format="JPEG", quality=85)
    res_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "predicted_class": final_class,
        "confidence": round(final_conf, 4),
        "yolo": yolo_det,
        "mobilenet": mobilenet_det,
        "cnn": cnn_det,
        "ensemble_probs": [round(float(p), 4) for p in ensemble_probs],
        "result_image": res_b64,
    }
