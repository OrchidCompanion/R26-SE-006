import io
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model_service import (
    load_bloom_models,
    predict_single_image_stage,
    forecast_blooming_timeline,
    BLOOMING_STAGES,
)
from database import (
    save_prediction_history,
    get_plant_prediction_history,
    get_user_prediction_history,
    soft_delete_prediction_history,
    get_sensor_statistics,
    save_sensor_reading,
)
from mqtt_consumer import start_mqtt_subscriber

app = FastAPI(
    title="Orchid Flowering Lifecycle Service",
    description="Microservice for Dendrobium orchid blooming stage identification (RF-DETR) and timeline forecasting (Gradient Boosting) by IT22190598",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        load_bloom_models()
        print("[FloweringService] Models loaded successfully.")
    except Exception as e:
        print(f"[FloweringService] Warning: Could not preload models: {e}")

    # Launch background MQTT subscriber for environmental telemetry
    start_mqtt_subscriber()


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "service": "Orchid Flowering Lifecycle Service",
        "status": "healthy",
        "models": ["Model 01 (Stage Classifier)", "Model 02 (Environmental Regressor)"],
        "mqtt_enabled": True,
    }


# ==============================================================================
# 27-PERMUTATION AGRONOMIC ENVIRONMENTAL EVALUATION
# ==============================================================================

def evaluate_environmental_conditions(
    avg_temp: float,
    avg_humidity: float,
    avg_light: float,
) -> Dict[str, Any]:
    temp = float(avg_temp) if avg_temp is not None else 27.5
    humidity = float(avg_humidity) if avg_humidity is not None else 72.5
    light = float(avg_light) if avg_light is not None else 20000.0

    temp_low = temp < 25
    temp_normal = 25 <= temp <= 30
    temp_high = temp > 30

    humidity_low = humidity < 70
    humidity_normal = 70 <= humidity <= 75
    humidity_high = humidity > 75

    light_low = light < 16000
    light_normal = 16000 <= light <= 32000
    light_high = light > 32000

    # 0 factors abnormal
    if temp_normal and humidity_normal and light_normal:
        recommendation = (
            "Environmental conditions are within the recommended range. "
            "Maintain the current orchid location and care routine."
        )
    # 3 factors abnormal
    elif temp_low and humidity_low and light_low:
        recommendation = (
            "Move the orchid to a warmer and brighter sheltered location. "
            "Place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif temp_high and humidity_high and light_high:
        recommendation = (
            "Move the orchid to a cooler, shaded and well-ventilated location away from strong afternoon sunlight. Avoid excessive watering."
        )
    elif temp_low and humidity_low and light_high:
        recommendation = (
            "Move the orchid to a warmer location with filtered natural shade to reduce direct sunlight, and place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif temp_low and humidity_high and light_low:
        recommendation = (
            "Move the orchid to a warmer, brighter, and well-ventilated location with gentle morning sunlight, and avoid keeping the growing medium excessively wet."
        )
    elif temp_low and humidity_high and light_high:
        recommendation = (
            "Move the orchid to a warmer location with natural shade to reduce excessive direct sunlight, and improve air movement to decrease excess humidity."
        )
    elif temp_high and humidity_low and light_low:
        recommendation = (
            "Move the orchid to a cooler location with bright, filtered natural light, and place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif temp_high and humidity_low and light_high:
        recommendation = (
            "Move the orchid to a cooler, naturally shaded location away from harsh afternoon sun, and place a shallow water-and-pebble tray nearby to increase local humidity."
        )
    elif temp_high and humidity_high and light_low:
        recommendation = (
            "Move the orchid to a cooler, brighter, and well-ventilated location away from high heat, and avoid excessive watering."
        )
    # 2 factors abnormal
    elif temp_low and light_low:
        recommendation = (
            "Move the orchid to a warmer location with better natural light, preferably with gentle morning sunlight, while maintaining current humidity."
        )
    elif temp_high and light_high:
        recommendation = (
            "Move the orchid to a cooler, naturally shaded location away from strong afternoon sunlight while maintaining suitable airflow."
        )
    elif humidity_low and light_low:
        recommendation = (
            "Move the orchid to a brighter location with gentle morning sunlight and place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif humidity_high and light_high:
        recommendation = (
            "Move the orchid to a partially shaded, well-ventilated location and reduce exposure to strong direct sunlight."
        )
    elif temp_low and humidity_low:
        recommendation = (
            "Move the orchid to a warmer, sheltered location and place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif temp_high and humidity_high:
        recommendation = (
            "Move the orchid to a cooler, well-ventilated location and avoid excessive watering."
        )
    elif temp_low and humidity_high:
        recommendation = (
            "Move the orchid to a warmer, well-ventilated location and avoid overwatering while maintaining current suitable light conditions."
        )
    elif temp_high and humidity_low:
        recommendation = (
            "Move the orchid to a cooler, well-ventilated location and place a shallow water-and-pebble tray nearby to increase local humidity while maintaining suitable light."
        )
    elif temp_high and light_low:
        recommendation = (
            "Move the orchid to a cooler location with bright, filtered natural light so that temperature can be reduced without further reducing light exposure."
        )
    elif temp_low and light_high:
        recommendation = (
            "Move the orchid to a warmer location with filtered natural light to reduce excessive direct sunlight."
        )
    elif humidity_low and light_high:
        recommendation = (
            "Reduce excessive direct sunlight with natural shade while placing a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif humidity_high and light_low:
        recommendation = (
            "Move the orchid to a brighter, well-ventilated location and avoid keeping the growing environment excessively wet."
        )
    # 1 factor abnormal
    elif temp_low:
        recommendation = (
            "Move the orchid to a warmer, sheltered location while maintaining its current suitable humidity and light conditions."
        )
    elif temp_high:
        recommendation = (
            "Move the orchid to a cooler, naturally shaded location while maintaining suitable filtered light and good air movement."
        )
    elif humidity_low:
        recommendation = (
            "Keep the orchid in its current suitable light and temperature location and place a shallow water-and-pebble tray nearby to provide additional local humidity."
        )
    elif humidity_high:
        recommendation = (
            "Keep the orchid in its current suitable light and temperature location, improve natural air circulation, and avoid excessive watering."
        )
    elif light_low:
        recommendation = (
            "Move the orchid to a brighter location with gentle morning sunlight while maintaining its current suitable temperature and humidity conditions."
        )
    elif light_high:
        recommendation = (
            "Reduce direct sunlight using natural shade or a light curtain while maintaining the current suitable temperature and humidity."
        )
    else:
        recommendation = (
            "Continue monitoring the environmental conditions and make only small adjustments to the orchid's location."
        )

    temp_status = "low" if temp_low else ("high" if temp_high else "optimal")
    hum_status = "low" if humidity_low else ("high" if humidity_high else "optimal")
    light_status = "low" if light_low else ("high" if light_high else "optimal")

    temp_labels = {"low": "Below Standard (< 25 °C)", "optimal": "Optimal (25–30 °C)", "high": "Above Standard (> 30 °C)"}
    hum_labels = {"low": "Below Standard (< 70%)", "optimal": "Optimal (70–75%)", "high": "Above Standard (> 75%)"}
    light_labels = {"low": "Below Standard (< 16,000 Lux)", "optimal": "Optimal (16,000–32,000 Lux)", "high": "Above Standard (> 32,000 Lux)"}

    return {
        "temperature_status": temp_status.capitalize(),
        "humidity_status": hum_status.capitalize(),
        "light_status": light_status.capitalize(),
        "recommendation": recommendation,
        "temperature": {
            "value": round(temp, 2),
            "target": "25–30 °C",
            "status": temp_status,
            "status_label": temp_labels.get(temp_status, "Optimal"),
        },
        "humidity": {
            "value": round(humidity, 2),
            "target": "70–75 %",
            "status": hum_status,
            "status_label": hum_labels.get(hum_status, "Optimal"),
        },
        "light": {
            "value": round(light, 2),
            "target": "16,000–32,000 Lux",
            "status": light_status,
            "status_label": light_labels.get(light_status, "Optimal"),
        },
    }


# ==============================================================================
# MAIN PREDICTION ROUTE
# ==============================================================================

@app.post("/predict", tags=["Bloom Prediction"])
@app.post("/analyze", tags=["Bloom Prediction"])
@app.post("/api/bloom/predict", tags=["Bloom Prediction"])
async def predict_bloom(
    plant_id: str = Form(...),
    image1: Optional[UploadFile] = File(None),
    image2: Optional[UploadFile] = File(None),
    image3: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Accepts 3 photos of the Dendrobium orchid (Frontal, Lateral Profile 1, Lateral Profile 2),
    identifies blooming stage via Model 01, aggregates IoT environmental stats,
    and forecasts timeline to flowering via Model 02.
    """
    effective_user_id = user_id or x_user_id or "anonymous"

    upload_list: List[Tuple[str, UploadFile]] = []
    if image1 and getattr(image1, "filename", None):
        upload_list.append(("Angle 1 (Frontal View - 90° Perpendicular)", image1))
    if image2 and getattr(image2, "filename", None):
        upload_list.append(("Angle 2 (Lateral Profile 1)", image2))
    if image3 and getattr(image3, "filename", None):
        upload_list.append(("Angle 3 (Lateral Profile 2)", image3))
    if not upload_list and image and getattr(image, "filename", None):
        upload_list.append(("Angle 1 (Frontal View)", image))

    if len(upload_list) != 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exactly 3 images are required for multi-angle bloom prediction (received {len(upload_list)}).",
        )

    # 1. Evaluate each uploaded angle
    img_predictions = []
    invalid_angles = []

    for idx, (label, f) in enumerate(upload_list, start=1):
        content = await f.read()
        try:
            pil_img = Image.open(io.BytesIO(content)).convert("RGB")
        except Exception:
            invalid_angles.append(f"Angle {idx}")
            img_predictions.append({
                "image_index": idx,
                "angle_label": label,
                "filename": f.filename,
                "stage": "Invalid",
                "confidence": 0.0,
                "is_valid": False,
                "is_orchid": False,
                "error": "Corrupted image file.",
            })
            continue

        stage_pred, conf_pred, is_valid, err = predict_single_image_stage(pil_img)
        if not is_valid:
            invalid_angles.append(f"Angle {idx}")

        img_predictions.append({
            "image_index": idx,
            "angle_label": label,
            "filename": f.filename,
            "stage": stage_pred,
            "confidence": conf_pred,
            "is_valid": is_valid,
            "is_orchid": is_valid,
            "error": err,
        })

    if invalid_angles:
        angles_str = ", ".join(invalid_angles)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Non-orchid image detected in {angles_str}. Please re-upload clear photos of your Dendrobium orchid for all 3 angles.",
        )

    # 2. Confidence-weighted majority voting across the 3 images
    stage_scores: Dict[str, float] = {}
    stage_counts: Dict[str, int] = {}
    for p in img_predictions:
        st = p["stage"]
        stage_scores[st] = stage_scores.get(st, 0.0) + p["confidence"]
        stage_counts[st] = stage_counts.get(st, 0) + 1

    final_stage = max(stage_scores.keys(), key=lambda s: stage_scores[s]) if stage_scores else "Vegetative"
    overall_conf = (
        round((stage_scores[final_stage] / stage_counts[final_stage]) * 100)
        if stage_scores
        else 85
    )

    # 3. Retrieve 30-day sensor telemetry stats
    sensor_stats = get_sensor_statistics(plant_id=plant_id, user_id=effective_user_id)

    # 4. Forecast timeline progression with Model 02
    total_days, timeline_steps = forecast_blooming_timeline(final_stage, sensor_stats)

    now_dt = datetime.now(timezone.utc)
    if final_stage == "Flowering":
        estimated_weeks = 0
        total_min_days = 0
        total_max_days = 0
        total_days_range_str = "0 Days (Currently Flowering)"
        total_days_display_str = "Currently in Bloom"
        date_range_str = "Currently in Bloom"
        pred_msg = "Your Dendrobium orchid is currently in full bloom!"
    else:
        estimated_weeks = max(1, round(total_days / 7.0))
        target_flower_dt = now_dt + timedelta(days=total_days)
        min_flower_dt = target_flower_dt - timedelta(days=5)
        max_flower_dt = target_flower_dt + timedelta(days=5)

        total_min_days = max(0, round(total_days - 5))
        total_max_days = round(total_days + 5)
        total_days_range_str = f"{total_min_days}–{total_max_days}"
        total_days_display_str = f"{total_min_days}–{total_max_days} Days"
        date_range_str = f"{min_flower_dt.strftime('%b %d')} – {max_flower_dt.strftime('%b %d, %Y')}"
        pred_msg = f"Estimated Flowering in {estimated_weeks} Weeks ({total_min_days}–{total_max_days} Days)"

        for step in timeline_steps:
            p_days = step.get("transition_days", 1.0)
            c_days = step.get("cumulative_days", 1.0)
            step_dt = now_dt + timedelta(days=c_days)
            step["transition_days_range"] = f"{max(1, round(p_days - 5))}–{round(p_days + 5)} Days"
            step["cumulative_days_range"] = f"{max(1, round(c_days - 5))}–{round(c_days + 5)}d"
            step["transition_window"] = f"{(step_dt - timedelta(days=5)).strftime('%b %d')} – {(step_dt + timedelta(days=5)).strftime('%b %d, %Y')}"

    # 5. Evaluate environmental conditions
    env_eval = evaluate_environmental_conditions(
        avg_temp=sensor_stats["avg_temp_c"],
        avg_humidity=sensor_stats["avg_humidity_rh"],
        avg_light=sensor_stats["avg_light_lux"],
    )

    # 6. Persist to Supabase
    record_payload = {
        "plant_id": plant_id,
        "user_id": effective_user_id,
        "current_stage": final_stage,
        "estimated_flowering_date": date_range_str,
        "flowering_date_range_display": date_range_str,
        "total_days_to_flowering": total_days,
        "display_total_days": round(total_days),
        "confidence": float(overall_conf),
        "timeline": timeline_steps,
        "sensor_summary": sensor_stats,
        "environment_evaluation": env_eval,
    }
    saved_record = save_prediction_history(record_payload)

    return {
        "plant_id": plant_id,
        "user_id": effective_user_id,
        "weeks": estimated_weeks,
        "current_stage": final_stage,
        "stage": final_stage,
        "confidence": overall_conf,
        "total_days_to_flowering": total_days,
        "display_total_days": round(total_days),
        "total_days_min": total_min_days,
        "total_days_max": total_max_days,
        "total_days_range": total_days_range_str,
        "total_days_display": total_days_display_str,
        "estimated_flowering_date": date_range_str,
        "flowering_date_range_display": date_range_str,
        "target_bloom_window": date_range_str,
        "prediction_msg": pred_msg,
        "image_predictions": img_predictions,
        "timeline": timeline_steps,
        "sensor_summary": sensor_stats,
        "environment_evaluation": env_eval,
        "record": saved_record,
    }


@app.post("/validate-image", tags=["Image Validation"])
async def validate_image(
    image: UploadFile = File(...),
    slot: Optional[str] = Form(None),
):
    """Validates an uploaded photo immediately for orchid leaf and botanical features."""
    content = await image.read()
    try:
        pil_img = Image.open(io.BytesIO(content)).convert("RGB")
        stage_pred, conf_pred, is_valid, err = predict_single_image_stage(pil_img)
        return {
            "filename": image.filename,
            "slot": slot,
            "is_orchid": is_valid,
            "is_valid": is_valid,
            "stage": stage_pred,
            "confidence": conf_pred,
            "error": err,
        }
    except Exception as e:
        return {
            "filename": image.filename,
            "slot": slot,
            "is_orchid": False,
            "is_valid": False,
            "stage": "Invalid",
            "confidence": 0.0,
            "error": str(e),
        }


# ==============================================================================
# TELEMETRY & HISTORY QUERY ENDPOINTS
# ==============================================================================

@app.post("/sensor-reading", tags=["IoT Telemetry"])
def ingest_sensor_reading(
    temperature: float = Form(...),
    humidity: float = Form(...),
    light: float = Form(...),
    plant_id: Optional[str] = Form(None),
    module_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Direct REST endpoint to post environmental reading (alternative to MQTT)."""
    saved = save_sensor_reading(
        temperature=temperature,
        humidity=humidity,
        light=light,
        plant_id=plant_id,
        module_id=module_id,
        user_id=user_id or x_user_id,
    )
    return {"status": "success", "record": saved}


@app.get("/plant/{plant_id}", tags=["History"])
def get_plant_history(
    plant_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
):
    """Retrieve historical bloom forecast records for a specific plant."""
    return get_plant_prediction_history(plant_id, page=page, limit=limit)


@app.get("/history", tags=["History"])
def get_user_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Retrieve all historical bloom forecasts for a user."""
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id query param or X-User-Id header required.")
    return get_user_prediction_history(effective_user_id)


@app.delete("/{record_id}", tags=["History"])
def delete_record(record_id: str):
    ok = soft_delete_prediction_history(record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Record not found or already deleted.")
    return {"message": "Bloom record soft deleted successfully."}
