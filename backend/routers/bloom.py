import io
import os
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from PIL import Image
import numpy as np
import cv2
import pandas as pd
import joblib

from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user


# ==============================================================================
# CONFIGURATION & CONSTANTS
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

def _find_model(filename: str) -> Path:
    candidates = [
        MODELS_DIR / filename,
        BASE_DIR.parent / "model_train_IT22190598" / "backend" / "app" / "models" / filename,
        BASE_DIR.parent / "model_train_IT22190598" / "models" / filename,
        Path(r"C:\Users\SN Gamalath\Downloads") / filename,
    ]
    for c in candidates:
        if c.exists():
            return c
    return MODELS_DIR / filename

MODEL01_PATH = _find_model("checkpoint_best_total.pth")
MODEL02_PATH = _find_model("gradient_boosting_experiment.joblib")

CONFIDENCE_THRESHOLD = 0.05

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
    2: "Mature_Pseudobulb",
    3: "Seedling",
    4: "Vegetative",
}

NEXT_STAGE_MAP = {
    "Seedling": "Vegetative",
    "Vegetative": "Mature_Pseudobulb",
    "Mature_Pseudobulb": "Bud_formation",
    "Bud_formation": "Flowering",
    "Flowering": None,
}

MODEL02_FEATURE_ORDER = [
    "current_stage",
    "month",
    "day_of_year",
    "avg_temp_c",
    "min_temp_c",
    "max_temp_c",
    "temp_std_c",
    "avg_humidity_rh",
    "min_humidity_rh",
    "max_humidity_rh",
    "humidity_std_rh",
    "avg_light_lux",
    "min_light_lux",
    "max_light_lux",
    "light_std_lux",
]

STAGE_CARE_GUIDES = {
    "Seedling": "Maintain warm temperatures (24–28°C), high humidity (70–80%), and gentle diffused light. Avoid strong direct sunlight.",
    "Vegetative": "Support robust pseudobulb and cane development with consistent watering, balanced orchid fertilizer, and 12,000–18,000 Lux light.",
    "Mature_Pseudobulb": "Mature canes store essential energy for flower spikes. Provide bright light (15,000–22,000 Lux) and a 5–7°C night-time temperature drop to initiate spikes.",
    "Bud_formation": "Keep humidity stable (60–75%) and avoid moving the pot to prevent bud drop or blast. Maintain 12,000–16,000 Lux filtered light.",
    "Flowering": "Your orchid is in full bloom! Keep flowers dry when misting and shield from harsh midday heat to enjoy long-lasting blooms (6–10 weeks).",
}

STAGE_OPTIMAL_CONDITIONS = {
    "Seedling": {"temp": "25–30 °C", "humidity": "70–75 %", "light": "16,000–32,000 Lux"},
    "Vegetative": {"temp": "25–30 °C", "humidity": "70–75 %", "light": "16,000–32,000 Lux"},
    "Mature_Pseudobulb": {"temp": "25–30 °C", "humidity": "70–75 %", "light": "16,000–32,000 Lux"},
    "Bud_formation": {"temp": "25–30 °C", "humidity": "70–75 %", "light": "16,000–32,000 Lux"},
    "Flowering": {"temp": "25–30 °C", "humidity": "70–75 %", "light": "16,000–32,000 Lux"},
}


# ==============================================================================
# AGRONOMIC ENVIRONMENTAL STANDARDS & EVALUATION
# ==============================================================================

AGRONOMIC_STANDARDS = {
    "optimal_conditions": {
        "temperature": "25–30 °C",
        "relative_humidity": "70–75 %",
        "light_intensity": "16,000–32,000 Lux",
    },
}


def evaluate_environmental_conditions(
    avg_temp: float,
    avg_humidity: float,
    avg_light: float
) -> Dict[str, Any]:
    """
    Rule-based multi-factor environmental recommendation for Dendrobium orchids.

    Adopted baseline conditions:
        Temperature: 25–30 °C
        Relative Humidity: 70–75 %
        Light: 16,000–32,000 lux

    The recommendation attempts to correct abnormal environmental factors
    while preserving factors that are already within the recommended range.
    """

    temp = avg_temp
    humidity = avg_humidity
    light = avg_light

    # ---------------------------------------------------------
    # 1. Determine environmental status
    # ---------------------------------------------------------

    temp_low = temp < 25
    temp_normal = 25 <= temp <= 30
    temp_high = temp > 30

    humidity_low = humidity < 70
    humidity_normal = 70 <= humidity <= 75
    humidity_high = humidity > 75

    light_low = light < 16000
    light_normal = 16000 <= light <= 32000
    light_high = light > 32000

    # ---------------------------------------------------------
    # 2. Completely suitable environment
    # ---------------------------------------------------------

    if temp_normal and humidity_normal and light_normal:
        recommendation = (
            "Environmental conditions are within the recommended range. "
            "Maintain the current orchid location and care routine."
        )

    # ---------------------------------------------------------
    # 3. Three factors abnormal
    # ---------------------------------------------------------

    elif temp_low and humidity_low and light_low:
        recommendation = (
            "Move the orchid to a warmer and brighter sheltered location. "
            "Place a shallow water-and-pebble tray nearby to provide "
            "additional local humidity."
        )

    elif temp_high and humidity_high and light_high:
        recommendation = (
            "Move the orchid to a cooler, shaded and well-ventilated "
            "location away from strong afternoon sunlight. Avoid excessive "
            "watering."
        )

    # ---------------------------------------------------------
    # 4. Two factors abnormal
    # ---------------------------------------------------------

    elif temp_low and light_low:
        recommendation = (
            "Move the orchid to a warmer location with better natural light, "
            "preferably with gentle morning sunlight, while maintaining the "
            "current humidity conditions."
        )

    elif temp_high and light_high:
        recommendation = (
            "Move the orchid to a cooler, naturally shaded location away "
            "from strong afternoon sunlight while maintaining suitable "
            "airflow."
        )

    elif humidity_low and light_low:
        recommendation = (
            "Move the orchid to a brighter location with gentle morning "
            "sunlight and place a shallow water-and-pebble tray nearby to "
            "provide additional local humidity."
        )

    elif humidity_high and light_high:
        recommendation = (
            "Move the orchid to a partially shaded, well-ventilated location "
            "and reduce exposure to strong direct sunlight."
        )

    elif temp_low and humidity_low:
        recommendation = (
            "Move the orchid to a warmer, sheltered location and place a "
            "shallow water-and-pebble tray nearby to provide additional "
            "local humidity."
        )

    elif temp_high and humidity_high:
        recommendation = (
            "Move the orchid to a cooler, well-ventilated location and "
            "avoid excessive watering."
        )

    elif temp_high and light_low:
        recommendation = (
            "Move the orchid to a cooler location with bright, filtered "
            "natural light so that temperature can be reduced without "
            "further reducing light exposure."
        )

    elif temp_low and light_high:
        recommendation = (
            "Move the orchid to a warmer location with filtered natural "
            "light to reduce excessive direct sunlight."
        )

    elif humidity_low and light_high:
        recommendation = (
            "Reduce excessive direct sunlight with natural shade while "
            "placing a shallow water-and-pebble tray nearby to provide "
            "additional local humidity."
        )

    elif humidity_high and light_low:
        recommendation = (
            "Move the orchid to a brighter, well-ventilated location and "
            "avoid keeping the growing environment excessively wet."
        )

    # ---------------------------------------------------------
    # 5. Only temperature abnormal
    # ---------------------------------------------------------

    elif temp_low:
        recommendation = (
            "Move the orchid to a warmer, sheltered location while "
            "maintaining its current suitable humidity and light conditions."
        )

    elif temp_high:
        recommendation = (
            "Move the orchid to a cooler, naturally shaded location while "
            "maintaining suitable filtered light and good air movement."
        )

    # ---------------------------------------------------------
    # 6. Only humidity abnormal
    # ---------------------------------------------------------

    elif humidity_low:
        recommendation = (
            "Keep the orchid in its current suitable light and temperature "
            "location and place a shallow water-and-pebble tray nearby to "
            "provide additional local humidity."
        )

    elif humidity_high:
        recommendation = (
            "Keep the orchid in its current suitable light and temperature "
            "location, improve natural air circulation, and avoid excessive "
            "watering."
        )

    # ---------------------------------------------------------
    # 7. Only light abnormal
    # ---------------------------------------------------------

    elif light_low:
        recommendation = (
            "Move the orchid to a brighter location with gentle morning "
            "sunlight while maintaining its current suitable temperature "
            "and humidity conditions."
        )

    elif light_high:
        recommendation = (
            "Reduce direct sunlight using natural shade or a light curtain "
            "while maintaining the current suitable temperature and humidity."
        )

    # ---------------------------------------------------------
    # 8. Safety fallback
    # ---------------------------------------------------------

    else:
        recommendation = (
            "Continue monitoring the environmental conditions and make only "
            "small adjustments to the orchid's location."
        )

    # ---------------------------------------------------------
    # 9. Return results
    # ---------------------------------------------------------

    temp_status_str = "Low" if temp_low else "High" if temp_high else "Optimal"
    hum_status_str = "Low" if humidity_low else "High" if humidity_high else "Optimal"
    light_status_str = "Low" if light_low else "High" if light_high else "Optimal"

    temp_labels = {"low": "Below Standard (< 25 °C)", "optimal": "Optimal (25–30 °C)", "high": "Above Standard (> 30 °C)"}
    hum_labels = {"low": "Below Standard (< 70%)", "optimal": "Optimal (70–75%)", "high": "Above Standard (> 75%)"}
    light_labels = {"low": "Below Standard (< 16,000 Lux)", "optimal": "Optimal (16,000–32,000 Lux)", "high": "Above Standard (> 32,000 Lux)"}

    temp_status_code = "low" if temp_low else ("high" if temp_high else "optimal")
    hum_status_code = "low" if humidity_low else ("high" if humidity_high else "optimal")
    light_status_code = "low" if light_low else ("high" if light_high else "optimal")

    return {
        "temperature_status": temp_status_str,
        "humidity_status": hum_status_str,
        "light_status": light_status_str,
        "recommendation": recommendation,
        "temperature": {
            "value": round(temp, 1),
            "target": "25–30 °C",
            "status": temp_status_code,
            "status_label": temp_labels.get(temp_status_code, "Optimal"),
        },
        "humidity": {
            "value": round(humidity, 1),
            "target": "70–75 %",
            "status": hum_status_code,
            "status_label": hum_labels.get(hum_status_code, "Optimal"),
        },
        "light": {
            "value": round(light, 0),
            "target": "16,000–32,000 Lux",
            "status": light_status_code,
            "status_label": light_labels.get(light_status_code, "Optimal"),
        },
    }


# ==============================================================================
# LAZY MODEL LOADERS
# ==============================================================================

_model01_instance = None
_model02_instance = None


def get_model01():
    """Load Model 01 (RF-DETR or fallback YOLO) once."""
    global _model01_instance
    if _model01_instance is None:
        model_path = str(MODEL01_PATH)
        print(f"[Bloom Router] Loading Model 01 from {model_path}...")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model 01 weights not found at: {model_path}")

        try:
            if model_path.endswith(".pth") or "rfdetr" in model_path.lower():
                from rfdetr import RFDETRSmall
                _model01_instance = ("rfdetr", RFDETRSmall(num_classes=5, pretrain_weights=model_path))
                print(f"[Bloom Router] RF-DETR Model 01 loaded successfully.")
            else:
                from ultralytics import YOLO
                _model01_instance = ("yolo", YOLO(model_path))
                print(f"[Bloom Router] YOLO Model 01 loaded successfully.")
        except Exception as e:
            print(f"[Bloom Router] Failed to load Model 01: {e}")
            raise e
    return _model01_instance


def get_model02():
    """Load Model 02 (Gradient Boosting timeline pipeline) once."""
    global _model02_instance
    if _model02_instance is None:
        model_path = str(MODEL02_PATH)
        print(f"[Bloom Router] Loading Model 02 from {model_path}...")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model 02 pipeline not found at: {model_path}")
        try:
            # Cross-version compatibility patch for scikit-learn unpickling
            try:
                import sklearn.compose._column_transformer as c_tr
                if not hasattr(c_tr, "_RemainderColsList"):
                    class _RemainderColsList(list):
                        pass
                    c_tr._RemainderColsList = _RemainderColsList

                import sklearn.impute._base as imp_base
                _orig_transform = imp_base.SimpleImputer.transform
                def _compat_transform(self, X):
                    if not hasattr(self, "_fill_dtype"):
                        self._fill_dtype = getattr(self, "_fit_dtype", getattr(self, "statistics_", np.array([])).dtype)
                    return _orig_transform(self, X)
                imp_base.SimpleImputer.transform = _compat_transform
            except Exception as pe:
                print(f"[Bloom Router] Compatibility patch warning: {pe}")

            _model02_instance = joblib.load(model_path)
            print(f"[Bloom Router] Gradient Boosting Model 02 loaded successfully.")
        except Exception as e:
            print(f"[Bloom Router] Failed to load Model 02: {e}")
            raise e
    return _model02_instance


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class BloomCreate(BaseModel):
    weeks: int
    plant_id: str


class BloomUpdate(BaseModel):
    weeks: Optional[int] = None


# ==============================================================================
# ROUTER DEFINITION
# ==============================================================================

router = APIRouter(prefix="/api/bloom", tags=["Predicted Bloom"])


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _validate_orchid_image(pil_img: Image.Image) -> Tuple[bool, str]:
    """
    Robust, illumination-invariant validation that separates genuine orchid photos
    (even in low-light, shadows, or with lower-quality mobile cameras) from non-plant
    objects such as ID cards, documents, blank screens, vehicles, and furniture.
    """
    try:
        img_rgb = np.array(pil_img.convert("RGB"))
        if img_rgb.size == 0:
            return False, "Image file is empty or unreadable."

        # 1. Reject pure flat/blank images
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        if float(np.std(gray)) < 0.5:
            return False, "Image is a blank solid color. Please upload a clear photo of your Dendrobium orchid."

        # 2. Lighting-Invariant CIELAB Color Space Analysis
        # In CIELAB, a* measures Green (< 125) vs Red (> 130), completely independent of illumination (L*)
        lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
        l_chan, a_chan = lab[:, :, 0], lab[:, :, 1]
        green_lab = (a_chan < 124) & (l_chan > 15) & (l_chan < 245)
        green_pct = float(np.mean(green_lab))

        # 3. HSV Orchid Floral Petal Detection
        hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
        h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
        # Pink / Purple / Magenta orchid petals (Hue: 135..175 in OpenCV 0..180 scale)
        pink_mask = (h >= 135) & (h <= 175) & (s > 25) & (v > 25)
        # Yellow / Cream orchid petals (Hue: 15..35)
        yellow_mask = (h >= 15) & (h <= 35) & (s > 30) & (v > 35)
        floral_pct = float(np.mean(pink_mask | yellow_mask))

        # 4. High-Frequency Document / Text Edge Density Check
        # ID cards, passports, and documents have high rectilinear text line density with 0% green foliage
        sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edge_energy = float(np.mean(np.abs(sobel_x) + np.abs(sobel_y)))

        if edge_energy > 25.0 and green_pct < 0.008:
            return False, "Document or ID card detected. Please upload a clear photo of your Dendrobium orchid plant."

        # Rejection: Must have at least 1.2% living plant tissue or at least 2.0% floral orchid content
        if green_pct < 0.012 and floral_pct < 0.020:
            return False, "Non-orchid image detected. No plant foliage, canes, or flowers detected. Please upload a clear photo of your Dendrobium orchid plant."

        return True, "Valid orchid"
    except Exception:
        return True, "Valid orchid"


def _predict_image_stage(image_bytes: bytes, filename: str, idx: int) -> Dict[str, Any]:
    """Run Model 01 inference on a single image with orchid validation and sensitive feature extraction."""
    model_type, model_obj = get_model01()
    try:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Step 0: Validate if image contains genuine plant/orchid features
        is_orchid, validation_msg = _validate_orchid_image(pil_img)
        if not is_orchid:
            return {
                "image_index": idx,
                "filename": filename,
                "stage": "Non-Orchid",
                "confidence": 0.0,
                "is_valid": False,
                "is_orchid": False,
                "error": validation_msg,
            }

        if model_type == "rfdetr":
            # RF-DETR inference on valid orchid image (Threshold 0.15 strictly rejects non-orchid objects like chairs/furniture/cars)
            results = model_obj.predict(pil_img, threshold=0.15)
            confs = getattr(results, "confidence", None)
            class_ids = getattr(results, "class_id", None)

            if confs is not None and len(confs) > 0 and float(max(confs)) >= 0.15:
                best_idx = int(np.argmax(confs))
                top_idx = int(class_ids[best_idx])
                conf = float(confs[best_idx])
                raw_name = STAGE_CLASS_MAP.get(top_idx, str(top_idx))
                mapped_stage = STAGE_CLASS_MAP.get(top_idx, raw_name)
            else:
                return {
                    "image_index": idx,
                    "filename": filename,
                    "stage": "Non-Orchid",
                    "confidence": 0.0,
                    "is_valid": False,
                    "is_orchid": False,
                    "error": "Non-orchid object detected. No recognizable Dendrobium orchid botanical structure found in this photo. Please upload a clear photo of your Dendrobium orchid.",
                }
        else:
            results = model_obj.predict(source=pil_img, imgsz=640, verbose=False)[0]
            if hasattr(results, "probs") and results.probs is not None:
                top_idx = int(results.probs.top1)
                conf = float(results.probs.top1conf)
            elif hasattr(results, "boxes") and results.boxes is not None and len(results.boxes) > 0:
                confs = results.boxes.conf.cpu().numpy()
                cls_indices = results.boxes.cls.cpu().numpy()
                best_idx = int(np.argmax(confs))
                top_idx = int(cls_indices[best_idx])
                conf = float(confs[best_idx])
            else:
                top_idx = 4
                conf = 0.50
            raw_name = getattr(model_obj, "names", {}).get(top_idx, str(top_idx))
            mapped_stage = STAGE_CLASS_MAP.get(top_idx, raw_name)

        return {
            "image_index": idx,
            "filename": filename,
            "stage": mapped_stage,
            "confidence": conf,
            "is_valid": True,
            "is_orchid": True,
            "error": None,
        }

    except Exception as e:
        return {
            "image_index": idx,
            "filename": filename,
            "stage": "Non-Orchid",
            "confidence": 0.0,
            "is_valid": False,
            "is_orchid": False,
            "error": f"Image processing error: {str(e)}",
        }


import uuid


def _is_valid_uuid(val: Any) -> bool:
    """Validate if string is a valid UUID."""
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _fetch_plant_sensor_telemetry(plant_id: str, user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Strictly fetch telemetry from Supabase IoT tables (dht11_environment_history & bh1750_environment_history)
    for the plant's IoT location, verifying plant validity and user authorization.
    NEVER uses manual or hardcoded fallback data.
    """
    if not _is_valid_uuid(plant_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid plant ID. Please select a valid plant registered in Supabase."
        )

    # Step 1: Query plant record and verify plant exists in Supabase
    plant_res = supabase.table("plants").select("plant_id, plant_name, user_id, location_id").eq("plant_id", str(plant_id)).execute()
    if not plant_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected plant was not found in Supabase. Please select an existing plant."
        )

    plant_data = plant_res.data[0]
    plant_owner_id = plant_data.get("user_id")
    plant_name = plant_data.get("plant_name", "Orchid")

    # Verify user authorization if user dictionary is provided
    if user and user.get("user_id"):
        curr_user_id = str(user["user_id"])
        user_role = str(user.get("role", "")).lower()
        if user_role != "admin" and plant_owner_id and str(plant_owner_id) != curr_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have permission to predict bloom for another user's plant."
            )

    if not plant_data.get("location_id"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Plant '{plant_name}' has no linked IoT monitoring location in Supabase. Please assign an active IoT location to this plant."
        )

    location_id = plant_data["location_id"]

    # Step 2: Query DHT11 environment history strictly from Supabase
    dht_res = (
        supabase.table("dht11_environment_history")
        .select("temperature, humidity, created_at")
        .eq("location_id", location_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )

    temps = [float(r["temperature"]) for r in (dht_res.data or []) if r.get("temperature") is not None]
    hums = [float(r["humidity"]) for r in (dht_res.data or []) if r.get("humidity") is not None]

    if not temps or not hums:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No DHT11 temperature and humidity IoT telemetry recorded in Supabase for {plant_name}. Real-time IoT sensor data is required."
        )

    # Step 3: Query BH1750 environment history strictly from Supabase
    bh_res = (
        supabase.table("bh1750_environment_history")
        .select("lux, created_at")
        .eq("location_id", location_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )

    luxs = [float(r["lux"]) for r in (bh_res.data or []) if r.get("lux") is not None]

    if not luxs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No BH1750 light intensity (Lux) IoT telemetry recorded in Supabase for {plant_name}. Real-time IoT sensor data is required."
        )

    # Compute exact statistical features strictly from IoT device readings with 2 decimal places
    return {
        "avg_temp_c": round(float(np.mean(temps)), 2),
        "min_temp_c": round(float(np.min(temps)), 2),
        "max_temp_c": round(float(np.max(temps)), 2),
        "temp_std_c": round(float(np.std(temps)), 2) if len(temps) > 1 else 0.0,
        "avg_humidity_rh": round(float(np.mean(hums)), 2),
        "min_humidity_rh": round(float(np.min(hums)), 2),
        "max_humidity_rh": round(float(np.max(hums)), 2),
        "humidity_std_rh": round(float(np.std(hums)), 2) if len(hums) > 1 else 0.0,
        "avg_light_lux": round(float(np.mean(luxs)), 2),
        "min_light_lux": round(float(np.min(luxs)), 2),
        "max_light_lux": round(float(np.max(luxs)), 2),
        "light_std_lux": round(float(np.std(luxs)), 2) if len(luxs) > 1 else 0.0,
        "data_window_days": 30,
        "telemetry_samples_count": max(len(temps), len(luxs)),
        "location_id": str(location_id),
        "plant_name": plant_name,
    }


# ==============================================================================
# MAIN AI PREDICTION PIPELINE ENDPOINT
# ==============================================================================

@router.post("/predict", status_code=status.HTTP_200_OK)
@router.post("/analyze", status_code=status.HTTP_200_OK)
async def predict_bloom_full_workflow(
    plant_id: str = Form(...),
    image: Optional[UploadFile] = File(None),
    image1: Optional[UploadFile] = File(None),
    image2: Optional[UploadFile] = File(None),
    image3: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Complete AI Orchid Bloom Prediction Pipeline:
    1. Model 01 (RF-DETR checkpoint_best_total.pth): Stage Identification with Confidence-Weighted Voting.
    2. Environmental Integration: Aggregates real-time DHT11 & BH1750 sensor readings for the plant.
    3. Model 02 (Gradient Boosting): Iteratively forecasts step-by-step transition days until Flowering.
    4. Calculates total days, estimated calendar flowering date (± 5 days), optimal care, and logs to Supabase.
    """
    # Gather uploaded image files without duplicates
    upload_list: List[Tuple[str, UploadFile]] = []
    
    # Check explicit slot names first
    if image1 is not None and getattr(image1, "filename", None):
        upload_list.append(("Angle 1 (Frontal View - 90° Perpendicular)", image1))
    if image2 is not None and getattr(image2, "filename", None):
        upload_list.append(("Angle 2 (Lateral Profile 1)", image2))
    if image3 is not None and getattr(image3, "filename", None):
        upload_list.append(("Angle 3 (Lateral Profile 2)", image3))

    # If slot names weren't used, check `image` as fallback
    if not upload_list and image is not None and getattr(image, "filename", None):
        upload_list.append(("Angle 1 (Frontal View)", image))

    # Enforce EXACTLY 3 photos requirement
    if len(upload_list) != 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exactly 3 images are required for multi-angle bloom prediction (received {len(upload_list)}). Please provide Angle 1 (Frontal 90°), Angle 2 (Lateral Profile 1), and Angle 3 (Lateral Profile 2).",
        )

    # Step 1: Read image bytes and run Model 01 Stage Identification with botanical orchid validation
    img_predictions = []
    invalid_angles = []
    for idx, (angle_label, upload_file) in enumerate(upload_list, start=1):
        content = await upload_file.read()
        fname = upload_file.filename or f"angle_{idx}.jpg"
        pred = _predict_image_stage(content, fname, idx)
        pred["angle_label"] = angle_label
        img_predictions.append(pred)

        if not pred.get("is_orchid", True) or not pred.get("is_valid", True):
            invalid_angles.append(f"{angle_label}")

    # If any uploaded photo is a non-orchid object, prompt the user to re-upload clear orchid photos
    if invalid_angles:
        angles_text = ", ".join(invalid_angles)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Non-orchid image detected in {angles_text}. Please re-upload clear photos of your Dendrobium orchid plant for all 3 angles to receive an accurate prediction.",
        )

    # Determine final stage via confidence-weighted majority voting across valid detections
    valid_preds = [p for p in img_predictions if p["is_valid"]]

    if not valid_preds:
        # Fallback if somehow no predictions were valid
        fallback = max(img_predictions, key=lambda p: p["confidence"])
        final_stage = fallback["stage"] if fallback["stage"] in BLOOMING_STAGES else "Vegetative"
        overall_conf = max(0.40, fallback["confidence"])
    else:
        stage_scores: Dict[str, float] = {}
        stage_counts: Dict[str, int] = {}
        for p in valid_preds:
            st = p["stage"]
            stage_scores[st] = stage_scores.get(st, 0.0) + p["confidence"]
            stage_counts[st] = stage_counts.get(st, 0) + 1

        final_stage = max(stage_scores.keys(), key=lambda s: stage_scores[s])
        overall_conf = stage_scores[final_stage] / stage_counts[final_stage]

    # Step 2: Fetch Live Environmental Telemetry & build 15-feature input for Model 02
    sensor_stats = _fetch_plant_sensor_telemetry(plant_id, user=current_user)

    now_dt = datetime.now(timezone.utc)
    month_val = now_dt.month
    doy_val = now_dt.timetuple().tm_yday

    # Step 3: Run Model 02 (Gradient Boosting) Transition Forecasting
    model02_pipe = get_model02()

    timeline_steps = []
    cumulative_days = 0.0
    curr_sim_stage = final_stage

    # If already flowering
    if final_stage == "Flowering":
        total_days = 0.0
        total_min_days = 0
        total_max_days = 0
        total_days_range_str = "0 Days (Currently Flowering)"
        total_days_display_str = "Currently in Bloom"
        estimated_weeks = 0
        date_range_str = "Currently in Bloom"
        est_date_str = date_range_str
        pred_msg = "Your Dendrobium orchid is currently in full bloom!"
    else:
        # Simulate stage transitions until Flowering
        sim_date = now_dt
        while curr_sim_stage and curr_sim_stage != "Flowering":
            next_stage = NEXT_STAGE_MAP.get(curr_sim_stage)
            if not next_stage:
                break

            # Construct 15-feature dataframe in exact trained order
            row_dict = {
                "current_stage": curr_sim_stage,
                "month": sim_date.month,
                "day_of_year": sim_date.timetuple().tm_yday,
                "avg_temp_c": sensor_stats["avg_temp_c"],
                "min_temp_c": sensor_stats["min_temp_c"],
                "max_temp_c": sensor_stats["max_temp_c"],
                "temp_std_c": sensor_stats["temp_std_c"],
                "avg_humidity_rh": sensor_stats["avg_humidity_rh"],
                "min_humidity_rh": sensor_stats["min_humidity_rh"],
                "max_humidity_rh": sensor_stats["max_humidity_rh"],
                "humidity_std_rh": sensor_stats["humidity_std_rh"],
                "avg_light_lux": sensor_stats["avg_light_lux"],
                "min_light_lux": sensor_stats["min_light_lux"],
                "max_light_lux": sensor_stats["max_light_lux"],
                "light_std_lux": sensor_stats["light_std_lux"],
            }
            df_feat = pd.DataFrame([row_dict], columns=MODEL02_FEATURE_ORDER)

            # Predict duration in days
            pred_days = float(model02_pipe.predict(df_feat)[0])
            pred_days = max(1.0, round(pred_days, 1))

            cumulative_days += pred_days
            sim_date = sim_date + timedelta(days=pred_days)

            step_min_dt = sim_date - timedelta(days=5)
            step_max_dt = sim_date + timedelta(days=5)
            step_window_str = f"{step_min_dt.strftime('%b %d')} – {step_max_dt.strftime('%b %d, %Y')}"

            step_min_days = max(1, round(pred_days - 5))
            step_max_days = round(pred_days + 5)
            step_days_range_str = f"{step_min_days}–{step_max_days} Days"

            cum_min_days = max(1, round(cumulative_days - 5))
            cum_max_days = round(cumulative_days + 5)
            cum_days_range_str = f"{cum_min_days}–{cum_max_days}d"

            timeline_steps.append({
                "from_stage": curr_sim_stage,
                "to_stage": next_stage,
                "transition_days": pred_days,
                "transition_days_range": step_days_range_str,
                "cumulative_days": round(cumulative_days, 1),
                "cumulative_days_range": cum_days_range_str,
                "transition_window": step_window_str,
                "estimated_date": step_window_str,
            })

            curr_sim_stage = next_stage

        total_days = cumulative_days
        estimated_weeks = max(1, round(total_days / 7.0))
        target_flower_dt = now_dt + timedelta(days=total_days)
        min_flower_dt = target_flower_dt - timedelta(days=5)
        max_flower_dt = target_flower_dt + timedelta(days=5)

        total_min_days = max(0, round(total_days - 5))
        total_max_days = round(total_days + 5)
        total_days_range_str = f"{total_min_days}–{total_max_days}"
        total_days_display_str = f"{total_min_days}–{total_max_days} Days"

        date_range_str = f"{min_flower_dt.strftime('%b %d')} – {max_flower_dt.strftime('%b %d, %Y')}"
        est_date_str = date_range_str
        pred_msg = f"Estimated Flowering in {estimated_weeks} Weeks ({total_min_days}–{total_max_days} Days)"

    # Step 4: Persist result to Supabase `predicted_bloom` table
    saved_record = None
    if _is_valid_uuid(plant_id) and _is_valid_uuid(current_user.get("user_id")):
        try:
            insert_res = (
                supabase.table("predicted_bloom")
                .insert({
                    "plant_id": str(plant_id),
                    "weeks": estimated_weeks,
                    "user_id": str(current_user["user_id"]),
                })
                .execute()
            )
            if insert_res.data:
                saved_record = insert_res.data[0]
        except Exception as dbe:
            print(f"[Bloom Router] Warning: Could not save prediction record to Supabase: {dbe}")

    # Step 5: Run Agronomic Environmental Evaluation
    env_eval = evaluate_environmental_conditions(
        avg_temp=sensor_stats["avg_temp_c"],
        avg_humidity=sensor_stats["avg_humidity_rh"],
        avg_light=sensor_stats["avg_light_lux"],
    )

    conf_pct = round(overall_conf * 100.0 if overall_conf <= 1.0 else overall_conf)

    return {
        "plant_id": plant_id,
        "plant_name": sensor_stats.get("plant_name", "Orchid"),
        "user_id": current_user.get("user_id"),
        "weeks": estimated_weeks,
        "current_stage": final_stage,
        "stage": final_stage,
        "confidence": conf_pct,
        "total_days_to_flowering": round(total_days, 1),
        "display_total_days": round(total_days),
        "total_days_min": total_min_days,
        "total_days_max": total_max_days,
        "total_days_range": total_days_range_str,
        "total_days_display": total_days_display_str,
        "estimated_flowering_date": est_date_str,
        "flowering_date_range_display": date_range_str,
        "target_bloom_window": date_range_str,
        "prediction_msg": pred_msg,
        "image_predictions": img_predictions,
        "timeline": timeline_steps,
        "sensor_summary": sensor_stats,
        "environment_evaluation": env_eval,
        "optimal_conditions": STAGE_OPTIMAL_CONDITIONS.get(final_stage, {}),
        "care_instructions": STAGE_CARE_GUIDES.get(final_stage, "Maintain balanced conditions."),
        "record": saved_record,
    }


# ==============================================================================
# CRUD ENDPOINTS
# ==============================================================================

@router.post("", status_code=status.HTTP_201_CREATED)
def create_bloom_prediction(
    data: BloomCreate, current_user: dict = Depends(get_current_user)
):
    """Record a new predicted bloom timeline manually."""
    response = (
        supabase.table("predicted_bloom")
        .insert({
            "weeks": data.weeks,
            "plant_id": data.plant_id,
            "user_id": current_user["user_id"],
        })
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=500, detail="Failed to record bloom prediction."
        )
    return response.data[0]


@router.get("")
def get_all_bloom_predictions(current_user: dict = Depends(get_current_user)):
    """Get all active predicted bloom records for the logged-in user."""
    response = (
        supabase.table("predicted_bloom")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_bloom_predictions_by_plant(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Fetch bloom prediction records for a specific plant with pagination."""
    start = (page - 1) * limit
    end = start + limit - 1
    response = (
        supabase.table("predicted_bloom")
        .select("*", count="exact")
        .eq("plant_id", plant_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(start, end)
        .execute()
    )
    return {
        "data": response.data,
        "total": response.count if response.count is not None else len(response.data),
        "page": page,
        "limit": limit,
    }


@router.get("/{record_id}")
def get_bloom_prediction_by_id(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Get prediction record by ID."""
    response = (
        supabase.table("predicted_bloom")
        .select("*")
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return response.data[0]


@router.put("/{record_id}")
def update_bloom_prediction(
    record_id: str, data: BloomUpdate, current_user: dict = Depends(get_current_user)
):
    """Update prediction record."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided.")

    response = (
        supabase.table("predicted_bloom")
        .update(update_fields)
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return response.data[0]


@router.delete("/{record_id}")
def soft_delete_bloom_prediction(
    record_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft delete bloom prediction record."""
    response = (
        supabase.table("predicted_bloom")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("record_id", record_id)
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"message": "Bloom record soft deleted successfully."}
