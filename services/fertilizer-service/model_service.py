from pathlib import Path
from typing import Tuple, Dict, Any, Optional
import cv2
import numpy as np
import pandas as pd
import joblib
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

COIN_DIAMETER_CM = 2.3
PIXELS_PER_CM_FIXED = 212.85
COIN_CLASS = 0
LEAF_CLASS = 1

_leaf_yolo: Optional[YOLO] = None
_growth_model = None
_growth_encoder = None


def load_fertilizer_models():
    global _leaf_yolo, _growth_model, _growth_encoder
    if _leaf_yolo is None:
        p_yolo = MODELS_DIR / "leaf_segmentation_best.pt"
        if not p_yolo.exists():
            raise FileNotFoundError(f"Missing {p_yolo}")
        print(f"[ModelService] Loading Leaf Segmentation YOLO from {p_yolo}...")
        _leaf_yolo = YOLO(str(p_yolo))

    if _growth_model is None or _growth_encoder is None:
        p_gm = MODELS_DIR / "growth_stage_model.pkl"
        p_enc = MODELS_DIR / "label_encoder.pkl"
        if not p_gm.exists() or not p_enc.exists():
            raise FileNotFoundError(f"Missing growth model {p_gm} or encoder {p_enc}")
        print(f"[ModelService] Loading Growth Stage Classifier from {p_gm}...")
        _growth_model = joblib.load(str(p_gm))
        _growth_encoder = joblib.load(str(p_enc))

    return _leaf_yolo, _growth_model, _growth_encoder


def analyze_leaf_and_growth(img_bgr: np.ndarray, leaf_count: int) -> Dict[str, Any]:
    """
    Performs YOLO instance segmentation on leaf and reference coin,
    computes physical measurements (length, width, area), and predicts growth stage.
    """
    leaf_yolo, growth_model, encoder = load_fertilizer_models()

    results = leaf_yolo(img_bgr, conf=0.25, verbose=False)
    detected_leaves = []
    detected_coins = []

    for r in results:
        if r.masks is None:
            continue
        masks = r.masks.data.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy()
        confidences = r.boxes.conf.cpu().numpy()

        for mask, cls, conf in zip(masks, classes, confidences):
            m = cv2.resize(mask, (r.orig_shape[1], r.orig_shape[0]), interpolation=cv2.INTER_NEAREST)
            bin_m = (m > 0.5).astype(np.uint8)
            area = cv2.countNonZero(bin_m)
            if area == 0:
                continue
            if int(cls) == COIN_CLASS:
                detected_coins.append({"mask": bin_m, "area": area})
            elif int(cls) == LEAF_CLASS:
                detected_leaves.append({"mask": bin_m, "area": area})

    # Reference coin calibration
    if detected_coins:
        max_coin = max(detected_coins, key=lambda x: x["area"])
        pixels_per_cm = (np.sqrt((4 * max_coin["area"]) / np.pi) / COIN_DIAMETER_CM)
    else:
        pixels_per_cm = PIXELS_PER_CM_FIXED

    if not detected_leaves:
        # Fallback if leaf mask was not segmented cleanly
        h, w = img_bgr.shape[:2]
        length_cm = round((h * 0.4) / pixels_per_cm, 2)
        width_cm = round((w * 0.2) / pixels_per_cm, 2)
        leaf_area_cm2 = round(length_cm * width_cm * 0.7, 2)
    else:
        largest_leaf = max(detected_leaves, key=lambda x: x["area"])
        leaf_area_cm2 = largest_leaf["area"] / (pixels_per_cm ** 2)

        contours, _ = cv2.findContours(largest_leaf["mask"], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if contours:
            contour = max(contours, key=cv2.contourArea)
            rect = cv2.minAreaRect(contour)
            width_cm = min(rect[1][0], rect[1][1]) / pixels_per_cm
            length_cm = max(rect[1][0], rect[1][1]) / pixels_per_cm
        else:
            length_cm = 8.0
            width_cm = 2.5

    input_df = pd.DataFrame({
        "opencv_leaf_length_cm": [length_cm],
        "opencv_leaf_width_cm": [width_cm],
        "opencv_leaf_area_cm2": [leaf_area_cm2],
        "leaf_count": [leaf_count],
    })

    pred = growth_model.predict(input_df)[0]
    prob = float(np.max(growth_model.predict_proba(input_df)[0]))
    growth_stage = str(encoder.inverse_transform([pred])[0])

    return {
        "leaf_length_cm": round(float(length_cm), 2),
        "leaf_width_cm": round(float(width_cm), 2),
        "leaf_area_cm2": round(float(leaf_area_cm2), 2),
        "leaf_count": leaf_count,
        "growth_stage": growth_stage,
        "confidence": round(prob, 4),
    }
