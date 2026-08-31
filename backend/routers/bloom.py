import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
import httpx
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel

from database import supabase
from utils.auth import get_current_user

# ==============================================================================
# CONFIGURATION & CONSTANTS
# ==============================================================================

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "https://dinukarathnayake-orchid-inference.hf.space")
HF_TOKEN = os.getenv("HF_TOKEN")

router = APIRouter(prefix="/api/bloom", tags=["Predicted Bloom"])


# ==============================================================================
# 27-PERMUTATION AGRONOMIC ENVIRONMENTAL EVALUATION
# ==============================================================================

def evaluate_environmental_conditions(
    avg_temp: float,
    avg_humidity: float,
    avg_light: float
) -> Dict[str, Any]:
    try:
        temp = float(avg_temp) if avg_temp is not None else 27.5
    except (ValueError, TypeError):
        temp = 27.5

    try:
        humidity = float(avg_humidity) if avg_humidity is not None else 72.5
    except (ValueError, TypeError):
        humidity = 72.5

    try:
        light = float(avg_light) if avg_light is not None else 20000.0
    except (ValueError, TypeError):
        light = 20000.0

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
# TELEMETRY FETCHER
# ==============================================================================

def _is_valid_uuid(val: Any) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _fetch_plant_sensor_telemetry(plant_id: str, user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not _is_valid_uuid(plant_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid plant ID. Please select a valid plant registered in Supabase."
        )

    plant_res = supabase.table("plants").select("plant_id, plant_name, user_id, location_id").eq("plant_id", str(plant_id)).execute()
    if not plant_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected plant was not found in Supabase. Please select an existing plant."
        )

    plant_data = plant_res.data[0]
    plant_owner_id = plant_data.get("user_id")
    plant_name = plant_data.get("plant_name", "Orchid")

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
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # Query DHT11
    dht_res = (
        supabase.table("dht11_environment_history")
        .select("temperature, humidity, created_at")
        .eq("location_id", location_id)
        .gte("created_at", cutoff_30d)
        .order("created_at", desc=True)
        .execute()
    )
    temps = [float(r["temperature"]) for r in (dht_res.data or []) if r.get("temperature") is not None]
    hums = [float(r["humidity"]) for r in (dht_res.data or []) if r.get("humidity") is not None]

    if not temps or not hums:
        fallback_dht = (
            supabase.table("dht11_environment_history")
            .select("temperature, humidity, created_at")
            .eq("location_id", location_id)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
        if fallback_dht.data:
            latest_iso = fallback_dht.data[0].get("created_at", "")
            if latest_iso:
                latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00"))
                window_30d_cutoff = (latest_dt - timedelta(days=30)).isoformat()
                active_readings = [r for r in fallback_dht.data if r.get("created_at") and r["created_at"] >= window_30d_cutoff]
                temps = [float(r["temperature"]) for r in active_readings if r.get("temperature") is not None]
                hums = [float(r["humidity"]) for r in active_readings if r.get("humidity") is not None]

    if not temps or not hums:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No DHT11 temperature and humidity IoT telemetry recorded in Supabase for {plant_name}. Real-time IoT sensor data is required."
        )

    # Query BH1750
    bh_res = (
        supabase.table("bh1750_environment_history")
        .select("lux, created_at")
        .eq("location_id", location_id)
        .gte("created_at", cutoff_30d)
        .order("created_at", desc=True)
        .execute()
    )
    luxs = [float(r["lux"]) for r in (bh_res.data or []) if r.get("lux") is not None]

    if not luxs:
        fallback_bh = (
            supabase.table("bh1750_environment_history")
            .select("lux, created_at")
            .eq("location_id", location_id)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
        if fallback_bh.data:
            latest_iso = fallback_bh.data[0].get("created_at", "")
            if latest_iso:
                latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00"))
                window_30d_cutoff = (latest_dt - timedelta(days=30)).isoformat()
                active_readings = [r for r in fallback_bh.data if r.get("created_at") and r["created_at"] >= window_30d_cutoff]
                luxs = [float(r["lux"]) for r in active_readings if r.get("lux") is not None]

    if not luxs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No BH1750 light intensity (Lux) IoT telemetry recorded in Supabase for {plant_name}. Real-time IoT sensor data is required."
        )

    import numpy as np
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
# MAIN AI PROXIED BLOOM PREDICTION ROUTE
# ==============================================================================

@router.post("/predict", status_code=status.HTTP_200_OK)
@router.post("/analyze", status_code=status.HTTP_200_OK)
async def predict_bloom_full_workflow(
    plant_id: str = Form(...),
    image1: Optional[UploadFile] = File(None),
    image2: Optional[UploadFile] = File(None),
    image3: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
):
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
            detail=f"Exactly 3 images are required for multi-angle bloom prediction (received {len(upload_list)}). Please provide Angle 1 (Frontal 90°), Angle 2 (Lateral Profile 1), and Angle 3 (Lateral Profile 2).",
        )

    # 1. Fetch sensor telemetry from Supabase
    sensor_stats = _fetch_plant_sensor_telemetry(plant_id, user=current_user)

    # 2. Forward images & telemetry to Hugging Face Space
    multipart_files = []
    for angle_label, f in upload_list:
        content = await f.read()
        multipart_files.append(("files", (f.filename or "angle.jpg", content, f.content_type or "image/jpeg")))

    data_payload = {"sensor_stats_json": json.dumps(sensor_stats)}
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{ML_SERVICE_URL}/predict/bloom",
                files=multipart_files,
                data=data_payload,
                headers=headers,
            )
            response.raise_for_status()
            ml_res = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"Inference Service Error: {exc.response.text}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Could not connect to bloom inference service: {str(e)}",
            )

    if ml_res.get("status") == "error":
        raise HTTPException(status_code=422, detail=ml_res.get("message", "Validation error occurred."))

    final_stage = ml_res.get("current_stage", "Vegetative")
    confidence = ml_res.get("confidence", 85)
    total_days = float(ml_res.get("total_days_to_flowering", 0.0))
    timeline_steps = ml_res.get("timeline", [])

    # Map angle names to image breakdown
    raw_img_preds = ml_res.get("image_predictions", [])
    formatted_img_preds = []
    for idx, pred in enumerate(raw_img_preds):
        angle_label = upload_list[idx][0] if idx < len(upload_list) else f"Angle {idx + 1}"
        pred["angle_label"] = angle_label
        formatted_img_preds.append(pred)

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

    # 3. Log to Supabase table `predicted_bloom`
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
            print(f"[Bloom Router] Warning: Could not save prediction to Supabase: {dbe}")

    # 4. Evaluate agronomic environmental factors
    env_eval = evaluate_environmental_conditions(
        avg_temp=sensor_stats["avg_temp_c"],
        avg_humidity=sensor_stats["avg_humidity_rh"],
        avg_light=sensor_stats["avg_light_lux"],
    )

    return {
        "plant_id": plant_id,
        "plant_name": sensor_stats.get("plant_name", "Orchid"),
        "user_id": current_user.get("user_id"),
        "weeks": estimated_weeks,
        "current_stage": final_stage,
        "stage": final_stage,
        "confidence": confidence,
        "total_days_to_flowering": round(total_days, 1),
        "display_total_days": round(total_days),
        "total_days_min": total_min_days,
        "total_days_max": total_max_days,
        "total_days_range": total_days_range_str,
        "total_days_display": total_days_display_str,
        "estimated_flowering_date": date_range_str,
        "flowering_date_range_display": date_range_str,
        "target_bloom_window": date_range_str,
        "prediction_msg": pred_msg,
        "image_predictions": formatted_img_preds,
        "timeline": timeline_steps,
        "sensor_summary": sensor_stats,
        "environment_evaluation": env_eval,
        "record": saved_record,
    }


@router.post("/validate-image", status_code=status.HTTP_200_OK)
async def validate_single_orchid_image(
    image: UploadFile = File(...),
    slot: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Proxies single image validation to HF"""
    content = await image.read()
    files_payload = [("files", (image.filename or "leaf.jpg", content, image.content_type or "image/jpeg"))]
    data_payload = {"sensor_stats_json": json.dumps({"avg_temp_c": 27.5, "avg_humidity_rh": 72.0, "avg_light_lux": 20000.0})}
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            res = await client.post(f"{ML_SERVICE_URL}/predict/bloom", files=files_payload, data=data_payload, headers=headers)
            data = res.json()
            preds = data.get("image_predictions", [{}])[0]
            return {
                "filename": image.filename,
                "slot": slot,
                "is_orchid": preds.get("is_orchid", False),
                "is_valid": preds.get("is_valid", False),
                "stage": preds.get("stage", "Invalid"),
                "confidence": preds.get("confidence", 0.0),
                "error": preds.get("error"),
            }
        except Exception as e:
            return {"filename": image.filename, "slot": slot, "is_orchid": False, "is_valid": False, "stage": "Invalid", "error": str(e)}


# ==============================================================================
# CRUD ENDPOINTS
# ==============================================================================

class BloomCreate(BaseModel):
    weeks: int
    plant_id: str

class BloomUpdate(BaseModel):
    weeks: Optional[int] = None

@router.post("", status_code=status.HTTP_201_CREATED)
def create_bloom_prediction(data: BloomCreate, current_user: dict = Depends(get_current_user)):
    res = supabase.table("predicted_bloom").insert({"weeks": data.weeks, "plant_id": data.plant_id, "user_id": current_user["user_id"]}).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to record bloom prediction.")
    return res.data[0]

@router.get("")
def get_all_bloom_predictions(current_user: dict = Depends(get_current_user)):
    res = supabase.table("predicted_bloom").select("*").eq("user_id", current_user["user_id"]).is_("deleted_at", "null").order("created_at", desc=True).execute()
    return res.data

@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_bloom_predictions_by_plant(plant_id: str, page: int = 1, limit: int = 10, current_user: dict = Depends(get_current_user)):
    start = (page - 1) * limit
    end = start + limit - 1
    query = supabase.table("predicted_bloom").select("*", count="exact").eq("plant_id", plant_id).is_("deleted_at", "null")
    if current_user.get("role") != "admin":
        query = query.eq("user_id", current_user["user_id"])
    res = query.order("created_at", desc=True).range(start, end).execute()
    return {"data": res.data, "total": res.count if res.count is not None else len(res.data), "page": page, "limit": limit}

@router.delete("/{record_id}")
def soft_delete_bloom_prediction(record_id: str, current_user: dict = Depends(get_current_user)):
    res = supabase.table("predicted_bloom").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("record_id", record_id).eq("user_id", current_user["user_id"]).is_("deleted_at", "null").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"message": "Bloom record soft deleted successfully."}