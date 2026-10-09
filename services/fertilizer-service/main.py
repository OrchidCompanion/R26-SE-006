import cv2
import numpy as np
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model_service import load_fertilizer_models, analyze_leaf_and_growth
from recommendation_engine import evaluate_npk
from database import (
    save_fertilizer_requirement,
    get_user_fertilizer_requirements,
    get_plant_fertilizer_requirements,
    get_fertilizer_requirement_by_id,
    soft_delete_fertilizer_requirement,
    get_latest_npk_reading,
    save_npk_reading,
)
from mqtt_consumer import start_mqtt_subscriber

app = FastAPI(
    title="Orchid Growth Stage & Fertilizer Service",
    description="Microservice for leaf dimension measurement, growth stage classification, and NPK fertilizer recommendation by IT22085726",
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
        load_fertilizer_models()
        print("[FertilizerService] Models loaded successfully.")
    except Exception as e:
        print(f"[FertilizerService] Warning: Could not preload models: {e}")

    # Launch background MQTT listener for soil NPK sensor streams
    start_mqtt_subscriber()


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "service": "Orchid Growth Stage & Fertilizer Service",
        "status": "healthy",
        "models": ["YOLO Leaf & Coin Segmentation", "Growth Stage Classifier"],
        "mqtt_enabled": True,
    }


# ==============================================================================
# MAIN GROWTH & FERTILIZER PIPELINE
# ==============================================================================

@app.post("/analyze", tags=["Fertilizer Analysis"])
@app.post("/predict", tags=["Fertilizer Analysis"])
@app.post("/predict-growth", tags=["Fertilizer Analysis"])
@app.post("/api/fertilizer/analyze", tags=["Fertilizer Analysis"])
async def analyze_growth_stage(
    leaf_count: int = Form(...),
    image: UploadFile = File(...),
    plant_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Analyzes an orchid leaf photo:
    1. Measures physical leaf length, width, and surface area via YOLO segmentation & coin scaling.
    2. Classifies botanical growth stage (Seedling, Vegetative, Pre Flowering, Matured, Flowering).
    3. Fetches live/historical soil NPK telemetry from MQTT readings.
    4. Evaluates stage-specific NPK fertilizer formulations and application adjustments.
    """
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    np_arr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=422, detail="Could not decode image.")

    # 1. Run leaf segmentation and growth stage classifier
    analysis_res = analyze_leaf_and_growth(img_bgr, leaf_count=leaf_count)
    growth_stage = analysis_res["growth_stage"]

    # 2. Retrieve latest soil NPK reading
    effective_user_id = user_id or x_user_id or "anonymous"
    npk_data = get_latest_npk_reading(plant_id=plant_id, user_id=effective_user_id)
    n_val = npk_data["nitrogen"]
    p_val = npk_data["phosphorous"]
    k_val = npk_data["potassium"]

    # 3. Compute stage-specific NPK recommendation
    npk_result = evaluate_npk(
        stage=growth_stage,
        nitrogen=n_val,
        phosphorous=p_val,
        potassium=k_val,
    )

    conf_val = float(analysis_res.get("confidence", 0.0))
    conf_decimal = conf_val / 100.0 if conf_val > 1.0 else conf_val

    # 4. Persist recommendation in Supabase
    record_payload = {
        "plant_id": plant_id,
        "user_id": effective_user_id,
        "fertilizer": f"NPK Ratio {npk_result.get('target_ratio')} ({growth_stage})",
        "qty": 1.0,
        "unit": "application",
        "growth_stage": growth_stage,
        "leaf_dimensions": {
            "length_cm": analysis_res.get("leaf_length_cm"),
            "width_cm": analysis_res.get("leaf_width_cm"),
            "area_cm2": analysis_res.get("leaf_area_cm2"),
            "leaf_count": leaf_count,
        },
        "npk_analysis": npk_result,
    }
    saved_record = save_fertilizer_requirement(record_payload)

    return {
        "plant_id": plant_id,
        "user_id": effective_user_id,
        "leaf_length_cm": analysis_res.get("leaf_length_cm"),
        "leaf_width_cm": analysis_res.get("leaf_width_cm"),
        "leaf_area_cm2": analysis_res.get("leaf_area_cm2"),
        "leaf_count": leaf_count,
        "growth_stage": growth_stage,
        "confidence": conf_decimal,
        "npk_reading": {
            "nitrogen": n_val,
            "phosphorous": p_val,
            "potassium": k_val,
            "device_id": npk_data.get("device_id", "esp32-s3-npk"),
        },
        "npk_recommendation": npk_result,
        "record": saved_record,
    }


# ==============================================================================
# CRUD & TELEMETRY ENDPOINTS
# ==============================================================================

class FertilizerCreate(BaseModel):
    fertilizer: str
    qty: float
    unit: str
    plant_id: str

@app.post("", status_code=status.HTTP_201_CREATED, tags=["Requirements"])
@app.post("/requirements", status_code=status.HTTP_201_CREATED, tags=["Requirements"])
def create_fertilizer_req(
    data: FertilizerCreate,
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = user_id or x_user_id or "anonymous"
    record = save_fertilizer_requirement({
        "fertilizer": data.fertilizer,
        "qty": data.qty,
        "unit": data.unit,
        "plant_id": data.plant_id,
        "user_id": effective_user_id,
    })
    return record


@app.get("", tags=["Requirements"])
@app.get("/requirements", tags=["Requirements"])
def get_user_requirements(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id query param or X-User-Id header required.")
    return get_user_fertilizer_requirements(effective_user_id)


@app.get("/plant/{plant_id}", tags=["Requirements"])
def get_plant_requirements(plant_id: str):
    return get_plant_fertilizer_requirements(plant_id)


@app.get("/{record_id}", tags=["Requirements"])
def get_requirement(record_id: str):
    record = get_fertilizer_requirement_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Requirement record not found.")
    return record


@app.delete("/{record_id}", tags=["Requirements"])
def delete_requirement(record_id: str):
    ok = soft_delete_fertilizer_requirement(record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Requirement not found or already deleted.")
    return {"message": "Fertilizer requirement deleted successfully."}


@app.post("/npk-reading", tags=["NPK Telemetry"])
def ingest_npk_reading(
    nitrogen: float = Form(...),
    phosphorus: float = Form(...),
    potassium: float = Form(...),
    plant_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Direct REST endpoint to post an NPK reading (alternative to MQTT)."""
    saved = save_npk_reading(
        nitrogen=nitrogen,
        phosphorus=phosphorus,
        potassium=potassium,
        plant_id=plant_id,
        user_id=user_id or x_user_id,
    )
    return {"status": "success", "record": saved}
