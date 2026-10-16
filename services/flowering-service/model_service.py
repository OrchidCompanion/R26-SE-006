import io
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import numpy as np
import cv2
import pandas as pd
import joblib
import torch
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

BLOOMING_STAGES = [
    "Seedling",
    "Vegetative",
    "Mature_Pseudobulb",
    "Bud_formation",
    "Flowering",
]

STAGE_CLASS_MAP = {
    0: "Bud_formation",
    1: "Flowering",
    2: "Invalid",
    3: "Mature_Pseudobulb",
    4: "Seedling",
    5: "Vegetative",
}

NEXT_STAGE_MAP = {
    "Seedling": "Vegetative",
    "Vegetative": "Mature_Pseudobulb",
    "Mature_Pseudobulb": "Bud_formation",
    "Bud_formation": "Flowering",
    "Flowering": None,
}

MODEL02_FEATURE_ORDER = [
    "current_stage", "month", "day_of_year",
    "avg_temp_c", "min_temp_c", "max_temp_c", "temp_std_c",
    "avg_humidity_rh", "min_humidity_rh", "max_humidity_rh", "humidity_std_rh",
    "avg_light_lux", "min_light_lux", "max_light_lux", "light_std_lux",
]

_model01 = None
_model02 = None


def load_bloom_models():
    global _model01, _model02
    if _model01 is None:
        p01 = MODELS_DIR / "checkpoint_best_total.pth"
        if p01.exists():
            try:
                import importlib
                rfdetr_module = importlib.import_module("rfdetr")
                RFDETRSmall = getattr(rfdetr_module, "RFDETRSmall")
                print(f"[ModelService] Loading RFDETR model from {p01}...")
                _model01 = ("rfdetr", RFDETRSmall(num_classes=6, pretrain_weights=str(p01)))
            except Exception:
                try:
                    print(f"[ModelService] Loading PyTorch model from {p01}...")
                    _model01 = ("torch", torch.load(str(p01), map_location="cpu"))
                except Exception as e:
                    print(f"[ModelService] Warning: Could not load Model 01 ({e})")
                    _model01 = None
        else:
            print(f"[ModelService] Missing {p01}")

    if _model02 is None:
        p02 = MODELS_DIR / "gradient_boosting_experiment.joblib"
        if p02.exists():
            print(f"[ModelService] Loading Gradient Boosting model from {p02}...")
            _model02 = joblib.load(str(p02))
        else:
            print(f"[ModelService] Missing {p02}")

    return _model01, _model02


def validate_orchid_image(pil_img: Image.Image) -> Tuple[bool, str]:
    """Validates botanical photo quality and checks for presence of orchid foliage/flowers."""
    try:
        img_rgb = np.array(pil_img.convert("RGB"))
        if img_rgb.size == 0:
            return False, "Image file is empty or unreadable."

        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        if float(np.std(gray)) < 0.5:
            return False, "Image is a blank solid color. Please upload a clear photo of your Dendrobium orchid."

        lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
        l_chan, a_chan = lab[:, :, 0], lab[:, :, 1]
        green_lab = (a_chan < 124) & (l_chan > 15) & (l_chan < 245)
        green_pct = float(np.mean(green_lab))

        hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
        h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
        pink_mask = (h >= 135) & (h <= 175) & (s > 25) & (v > 25)
        yellow_mask = (h >= 15) & (h <= 35) & (s > 30) & (v > 35)
        floral_pct = float(np.mean(pink_mask | yellow_mask))

        sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edge_energy = float(np.mean(np.abs(sobel_x) + np.abs(sobel_y)))

        if edge_energy > 25.0 and green_pct < 0.008:
            return False, "Document or ID card detected. Please upload a clear photo of your Dendrobium orchid plant."

        if green_pct < 0.012 and floral_pct < 0.020:
            return False, "Non-orchid image detected. No plant foliage, canes, or flowers detected."

        return True, "Valid orchid"
    except Exception:
        return True, "Valid orchid"


def predict_single_image_stage(pil_img: Image.Image) -> Tuple[str, float, bool, Optional[str]]:
    """Predicts blooming stage for an individual image."""
    is_valid, msg = validate_orchid_image(pil_img)
    if not is_valid:
        return "Invalid", 0.0, False, msg

    model01_tuple, _ = load_bloom_models()
    stage_pred = "Vegetative"
    conf_pred = 0.85

    if model01_tuple is not None:
        mtype, mobj = model01_tuple
        if mtype == "rfdetr":
            res = mobj.predict(pil_img, threshold=0.15)
            confs = getattr(res, "confidence", None)
            c_ids = getattr(res, "class_id", None)
            if confs is not None and len(confs) > 0 and float(max(confs)) >= 0.15:
                best_i = int(np.argmax(confs))
                top_i = int(c_ids[best_i])
                conf_pred = float(confs[best_i])
                stage_pred = STAGE_CLASS_MAP.get(top_i, "Vegetative")
            else:
                stage_pred = "Invalid"
                conf_pred = 0.0

    is_valid_stage = stage_pred != "Invalid" and stage_pred in BLOOMING_STAGES
    error_msg = None if is_valid_stage else "Could not identify orchid blooming stage."
    return stage_pred, conf_pred, is_valid_stage, error_msg


def forecast_blooming_timeline(
    current_stage: str,
    sensor_stats: Dict[str, Any],
) -> Tuple[float, List[Dict[str, Any]]]:
    """Uses Model 02 (Gradient Boosting) to forecast stage progression days until flowering."""
    _, model02 = load_bloom_models()

    if current_stage == "Flowering" or model02 is None:
        return 0.0, []

    now_dt = datetime.now(timezone.utc)
    sim_date = now_dt
    cumulative_days = 0.0
    curr_sim_stage = current_stage
    timeline_steps = []

    while curr_sim_stage and curr_sim_stage != "Flowering":
        next_stage = NEXT_STAGE_MAP.get(curr_sim_stage)
        if not next_stage:
            break

        row_dict = {
            "current_stage": curr_sim_stage,
            "month": sim_date.month,
            "day_of_year": sim_date.timetuple().tm_yday,
            **{
                k: sensor_stats.get(k, 0.0)
                for k in MODEL02_FEATURE_ORDER
                if k not in ["current_stage", "month", "day_of_year"]
            },
        }

        df_feat = pd.DataFrame([row_dict], columns=MODEL02_FEATURE_ORDER)
        try:
            pred_days = max(1.0, round(float(model02.predict(df_feat)[0]), 1))
        except Exception:
            # Fallback biological averages
            pred_days = 28.0 if curr_sim_stage == "Vegetative" else 14.0

        cumulative_days += pred_days
        sim_date += timedelta(days=pred_days)

        timeline_steps.append({
            "from_stage": curr_sim_stage,
            "to_stage": next_stage,
            "transition_days": pred_days,
            "cumulative_days": round(cumulative_days, 1),
        })
        curr_sim_stage = next_stage

    return round(cumulative_days, 1), timeline_steps
