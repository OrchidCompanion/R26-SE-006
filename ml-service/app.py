import os
import io
import base64
import json
from typing import List, Optional, Tuple, Dict, Any
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from PIL import Image
import numpy as np
import cv2
import pandas as pd
import joblib
import torch
from ultralytics import YOLO

app = FastAPI(title="OrchidCompanion Unified ML Service")

BASE_DIR = Path(__file__).resolve().parent

# ==============================================================================
# MODEL LOADERS
# ==============================================================================

# 1. Species Model
_species_model = None
def get_species_model():
    global _species_model
    if _species_model is None:
        path = BASE_DIR / "species-identification.pt"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}")
        _species_model = YOLO(str(path))
    return _species_model

# 2. Bloom Models
_bloom_model01 = None
_bloom_model02 = None

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

def get_bloom_models():
    global _bloom_model01, _bloom_model02
    if _bloom_model01 is None:
        path01 = BASE_DIR / "checkpoint_best_total.pth"
        if path01.exists():
            try:
                import importlib
                rfdetr_module = importlib.import_module("rfdetr")
                RFDETRSmall = getattr(rfdetr_module, "RFDETRSmall")
                _bloom_model01 = ("rfdetr", RFDETRSmall(num_classes=6, pretrain_weights=str(path01)))
            except Exception:
                try:
                    _bloom_model01 = ("torch", torch.load(str(path01), map_location="cpu"))
                except Exception as e:
                    print(f"Warning: Could not load bloom model 01: {e}")
                    _bloom_model01 = None
        else:
            _bloom_model01 = None

    if _bloom_model02 is None:
        path02 = BASE_DIR / "gradient_boosting_experiment.joblib"
        if path02.exists():
            _bloom_model02 = joblib.load(str(path02))
    return _bloom_model01, _bloom_model02

# 3. Fertilizer / Leaf Models
_leaf_yolo = None
_growth_model = None
_growth_encoder = None

COIN_DIAMETER_CM = 2.3
PIXELS_PER_CM_FIXED = 212.85
COIN_CLASS = 0
LEAF_CLASS = 1

def get_leaf_models():
    global _leaf_yolo, _growth_model, _growth_encoder
    if _leaf_yolo is None:
        path_yolo = BASE_DIR / "leaf_segmentation_best.pt"
        if not path_yolo.exists():
            path_yolo = BASE_DIR / "best.pt"
        _leaf_yolo = YOLO(str(path_yolo))
    if _growth_model is None or _growth_encoder is None:
        path_gm = BASE_DIR / "growth_stage_model.pkl"
        path_enc = BASE_DIR / "label_encoder.pkl"
        _growth_model = joblib.load(str(path_gm))
        _growth_encoder = joblib.load(str(path_enc))
    return _leaf_yolo, _growth_model, _growth_encoder

# 4. Disease Models (YOLO + MobileNetV2 + CNN)
_disease_yolo = None
_disease_mobilenet = None
_disease_cnn = None

DISEASE_CLASSES = ["bacterial_brown_spot", "black_rot", "healthy", "invalid"]

def get_disease_models():
    global _disease_yolo, _disease_mobilenet, _disease_cnn
    if _disease_yolo is None:
        p_yolo = BASE_DIR / "disease_yolo.pt"
        if not p_yolo.exists():
            p_yolo = BASE_DIR / "yolov26best.pt"
        _disease_yolo = YOLO(str(p_yolo))

    if _disease_mobilenet is None or _disease_cnn is None:
        import tensorflow as tf
        p_mb = BASE_DIR / "disease_mobilenetv2.keras"
        if not p_mb.exists():
            p_mb = BASE_DIR / "MobileNetV2_best.keras"
        _disease_mobilenet = tf.keras.models.load_model(str(p_mb))

        p_cnn = BASE_DIR / "disease_custom_cnn.keras"
        if not p_cnn.exists():
            p_cnn = BASE_DIR / "CNN_best.keras"
        _disease_cnn = tf.keras.models.load_model(str(p_cnn))

    return _disease_yolo, _disease_mobilenet, _disease_cnn


# ==============================================================================
# SPECIES IDENTIFICATION ENDPOINT
# ==============================================================================

@app.get("/")
def health():
    return {"status": "running", "service": "Unified ML Service"}

@app.post("/predict/species")
async def predict_species(files: List[UploadFile] = File(...), conf_threshold: float = 0.35):
    model = get_species_model()
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    overall_results = []
    species_detected_counts: Dict[str, int] = {}

    for file in files:
        content = await file.read()
        pil_image = Image.open(io.BytesIO(content)).convert("RGB")

        preds = model.predict(source=pil_image, conf=conf_threshold, imgsz=640)
        result = preds[0]
        boxes = result.boxes

        detections = []
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()

                species_detected_counts[cls_name] = species_detected_counts.get(cls_name, 0) + 1
                detections.append({
                    "species": cls_name,
                    "confidence": round(conf, 4),
                    "confidence_percentage": f"{conf * 100:.1f}%",
                    "box": {
                        "xmin": round(xyxy[0], 1), "ymin": round(xyxy[1], 1),
                        "xmax": round(xyxy[2], 1), "ymax": round(xyxy[3], 1),
                    },
                })

        annotated_bgr = result.plot()
        annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])
        buf = io.BytesIO()
        annotated_rgb.save(buf, format="JPEG")
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        overall_results.append({
            "filename": file.filename,
            "detected_count": len(detections),
            "detections": detections,
            "annotated_image": f"data:image/jpeg;base64,{img_b64}",
        })

    verdict = f"Identified as {max(species_detected_counts, key=species_detected_counts.get).capitalize()} orchid" if species_detected_counts else "No orchid detected (No Dendrobium, Phalaenopsis, or Oncidium recognized)"

    return {
        "status": "success",
        "verdict": verdict,
        "total_images_processed": len(overall_results),
        "results": overall_results,
    }


# ==============================================================================
# BLOOM PREDICTION ENDPOINT
# ==============================================================================

def validate_orchid_image(pil_img: Image.Image) -> Tuple[bool, str]:
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


@app.post("/predict/bloom")
async def predict_bloom(
    files: List[UploadFile] = File(...),
    sensor_stats_json: str = Form(...),
):
    model01_tuple, model02 = get_bloom_models()
    sensor_stats = json.loads(sensor_stats_json)

    img_predictions = []
    invalid_angles = []

    for idx, f in enumerate(files, start=1):
        content = await f.read()
        pil_img = Image.open(io.BytesIO(content)).convert("RGB")

        is_orchid, msg = validate_orchid_image(pil_img)
        if not is_orchid:
            invalid_angles.append(f"Angle {idx}")
            img_predictions.append({
                "image_index": idx,
                "filename": f.filename,
                "stage": "Invalid",
                "confidence": 0.0,
                "is_valid": False,
                "is_orchid": False,
                "error": msg,
            })
            continue

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
            elif mtype == "yolo":
                res = mobj.predict(source=pil_img, imgsz=640, verbose=False)[0]
                if hasattr(res, "probs") and res.probs is not None:
                    top_i = int(res.probs.top1)
                    conf_pred = float(res.probs.top1conf)
                    stage_pred = STAGE_CLASS_MAP.get(top_i, "Vegetative")

        is_valid_stage = stage_pred != "Invalid" and stage_pred in BLOOMING_STAGES
        if not is_valid_stage:
            invalid_angles.append(f"Angle {idx}")

        img_predictions.append({
            "image_index": idx,
            "filename": f.filename,
            "stage": stage_pred,
            "confidence": conf_pred,
            "is_valid": is_valid_stage,
            "is_orchid": is_valid_stage,
            "error": None if is_valid_stage else f"Non-orchid image detected in Angle {idx}.",
        })

    if invalid_angles:
        angles_str = ", ".join(invalid_angles)
        return {
            "status": "error",
            "message": f"Non-orchid image detected in {angles_str}. The AI model classified the photo as not an orchid (Invalid). Please re-upload clear photos of your Dendrobium orchid plant for all 3 angles to receive an accurate prediction.",
            "image_predictions": img_predictions,
        }

    # Confidence-weighted majority voting
    valid_preds = [p for p in img_predictions if p["is_valid"]]
    stage_scores: Dict[str, float] = {}
    stage_counts: Dict[str, int] = {}
    for p in valid_preds:
        st = p["stage"]
        stage_scores[st] = stage_scores.get(st, 0.0) + p["confidence"]
        stage_counts[st] = stage_counts.get(st, 0) + 1

    final_stage = max(stage_scores.keys(), key=lambda s: stage_scores[s]) if stage_scores else "Vegetative"
    overall_conf = stage_scores[final_stage] / stage_counts[final_stage] if stage_scores else 0.85

    # Forecast timeline
    now_dt = datetime.now(timezone.utc)
    cumulative_days = 0.0
    curr_sim_stage = final_stage
    timeline_steps = []

    if final_stage != "Flowering" and model02 is not None:
        sim_date = now_dt
        while curr_sim_stage and curr_sim_stage != "Flowering":
            next_stage = NEXT_STAGE_MAP.get(curr_sim_stage)
            if not next_stage:
                break

            row_dict = {
                "current_stage": curr_sim_stage,
                "month": sim_date.month,
                "day_of_year": sim_date.timetuple().tm_yday,
                **{k: sensor_stats.get(k, 0.0) for k in MODEL02_FEATURE_ORDER if k not in ["current_stage", "month", "day_of_year"]}
            }
            df_feat = pd.DataFrame([row_dict], columns=MODEL02_FEATURE_ORDER)
            pred_days = max(1.0, round(float(model02.predict(df_feat)[0]), 1))
            cumulative_days += pred_days
            sim_date += timedelta(days=pred_days)

            timeline_steps.append({
                "from_stage": curr_sim_stage,
                "to_stage": next_stage,
                "transition_days": pred_days,
                "cumulative_days": round(cumulative_days, 1),
            })
            curr_sim_stage = next_stage

    return {
        "status": "success",
        "current_stage": final_stage,
        "confidence": round(overall_conf * 100 if overall_conf <= 1.0 else overall_conf),
        "total_days_to_flowering": round(cumulative_days, 1),
        "timeline": timeline_steps,
        "image_predictions": img_predictions,
    }


# ==============================================================================
# FERTILIZER / LEAF GROWTH PREDICTION ENDPOINT
# ==============================================================================

@app.post("/predict/fertilizer-growth")
async def predict_fertilizer_growth(
    image: UploadFile = File(...),
    leaf_count: int = Form(...),
):
    leaf_yolo, growth_model, encoder = get_leaf_models()
    content = await image.read()
    np_arr = np.frombuffer(content, np.uint8)
    img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    results = leaf_yolo(img_bgr, conf=0.25)
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

    pixels_per_cm = (np.sqrt((4 * max(detected_coins, key=lambda x: x['area'])['area']) / np.pi) / COIN_DIAMETER_CM) if detected_coins else PIXELS_PER_CM_FIXED
    if not detected_leaves:
        raise HTTPException(status_code=400, detail="No leaf detected in the image.")

    largest_leaf = max(detected_leaves, key=lambda x: x["area"])
    leaf_area_cm2 = largest_leaf["area"] / (pixels_per_cm ** 2)

    contours, _ = cv2.findContours(largest_leaf["mask"], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contour = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(contour)
    width_cm = min(rect[1][0], rect[1][1]) / pixels_per_cm
    length_cm = max(rect[1][0], rect[1][1]) / pixels_per_cm

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
        "status": "success",
        "leaf_length_cm": round(float(length_cm), 2),
        "leaf_width_cm": round(float(width_cm), 2),
        "leaf_area_cm2": round(float(leaf_area_cm2), 2),
        "leaf_count": leaf_count,
        "growth_stage": growth_stage,
        "confidence": round(prob, 4),
    }


# ==============================================================================
# 4. DISEASE DIAGNOSTICS ENSEMBLE ENDPOINT
# ==============================================================================

@app.post("/predict/disease")
async def predict_disease_ensemble(
    image: UploadFile = File(...),
):
    yolo_model, mobilenet_model, cnn_model = get_disease_models()
    content = await image.read()
    pil_img = Image.open(io.BytesIO(content)).convert("RGB")
    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    # 1. YOLO Detection & Cropping
    yolo_res = yolo_model.predict(source=pil_img, conf=0.25, imgsz=640)[0]
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

        # Crop detected spot for classifiers
        h, w = pil_img.size[1], pil_img.size[0]
        x1, y1, x2, y2 = max(0, xyxy[0]), max(0, xyxy[1]), min(w, xyxy[2]), min(h, xyxy[3])
        if (x2 - x1) > 10 and (y2 - y1) > 10:
            crop_img = pil_img.crop((x1, y1, x2, y2))

    # 2. Preprocess Crop for MobileNetV2 and CNN (224x224)
    crop_resized = crop_img.resize((224, 224))
    crop_arr = np.array(crop_resized, dtype=np.float32) / 255.0
    crop_batch = np.expand_dims(crop_arr, axis=0)

    # 3. MobileNetV2 Inference
    mb_probs = mobilenet_model.predict(crop_batch, verbose=0)[0]
    mb_top_idx = int(np.argmax(mb_probs))
    mobilenet_det = {
        "class_name": DISEASE_CLASSES[mb_top_idx] if mb_top_idx < len(DISEASE_CLASSES) else str(mb_top_idx),
        "confidence": float(mb_probs[mb_top_idx]),
        "probabilities": [float(p) for p in mb_probs],
    }

    # 4. Custom CNN Inference
    cnn_probs = cnn_model.predict(crop_batch, verbose=0)[0]
    cnn_top_idx = int(np.argmax(cnn_probs))
    cnn_det = {
        "class_name": DISEASE_CLASSES[cnn_top_idx] if cnn_top_idx < len(DISEASE_CLASSES) else str(cnn_top_idx),
        "confidence": float(cnn_probs[cnn_top_idx]),
        "probabilities": [float(p) for p in cnn_probs],
    }

    # 5. Weighted Ensemble Fusion (0.55 MobileNet + 0.45 CNN)
    ensemble_probs = 0.55 * mb_probs + 0.45 * cnn_probs
    top_class_idx = int(np.argmax(ensemble_probs))
    final_class = DISEASE_CLASSES[top_class_idx] if top_class_idx < len(DISEASE_CLASSES) else str(top_class_idx)
    final_conf = float(ensemble_probs[top_class_idx])

    # 6. Generate Annotated Bounding Box Image
    annotated_bgr = yolo_res.plot()
    annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])
    buf = io.BytesIO()
    annotated_rgb.save(buf, format="JPEG")
    res_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "status": "success",
        "predicted_class": final_class,
        "confidence": round(final_conf, 4),
        "yolo": yolo_det,
        "mobilenet": mobilenet_det,
        "cnn": cnn_det,
        "ensemble_probs": [round(float(p), 4) for p in ensemble_probs],
        "result_image": res_b64,
    }