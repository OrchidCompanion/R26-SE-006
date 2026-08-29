import json
import io
import pandas as pd
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, status
from pydantic import ValidationError

from app.schemas.prediction import (
    Model01DetectionResponse,
    Model02SensorInput,
    TransitionPredictionResponse,
    PredictBloomResponse,
    SupabaseFetchRequest,
    SupabaseParseRawRequest,
    SupabasePlantsRequest,
    SupabaseModulesRequest
)
from app.services.model01_service import get_model01_service
from app.services.model02_service import get_model02_service
from app.services.bloom_prediction_service import get_bloom_prediction_service
from app.services.supabase_service import (
    compute_reading_stats,
    fetch_supabase_plants,
    fetch_supabase_modules,
    fetch_supabase_readings
)

router = APIRouter(prefix="/api/v1", tags=["Bloom Prediction Pipeline"])

@router.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "system": "Dendrobium Orchid Bloom Prediction API"}

@router.post("/detect-stage", response_model=Model01DetectionResponse, status_code=status.HTTP_200_OK)
async def detect_stage(
    image1: UploadFile = File(...),
    image2: UploadFile = File(...),
    image3: UploadFile = File(...)
):
    """
    Process three orchid images through Model 01 (RF-DETR checkpoint_best_total.pth)
    and return individual image predictions + confidence-weighted majority blooming stage.
    """
    try:
        content1 = await image1.read()
        content2 = await image2.read()
        content3 = await image3.read()

        image_tuples = [
            (image1.filename or "image1.jpg", content1),
            (image2.filename or "image2.jpg", content2),
            (image3.filename or "image3.jpg", content3)
        ]

        model01_svc = get_model01_service()
        return model01_svc.process_three_images(image_tuples)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model 01 detection error: {str(e)}")

@router.post("/predict-transition", response_model=TransitionPredictionResponse, status_code=status.HTTP_200_OK)
def predict_transition(sensor_input: Model02SensorInput):
    """
    Run Model 02 (Gradient Boosting pipeline) to predict transition duration
    from current stage to the next blooming stage using exact 15 feature vector.
    """
    try:
        model02_svc = get_model02_service()
        return model02_svc.predict_transition(sensor_input)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model 02 prediction error: {str(e)}")

@router.post("/predict-bloom", response_model=PredictBloomResponse, status_code=status.HTTP_200_OK)
async def predict_bloom(
    image1: UploadFile = File(...),
    image2: UploadFile = File(...),
    image3: UploadFile = File(...),
    sensor_data: Optional[str] = Form(None)
):
    """
    Complete end-to-end prediction workflow:
    3 Images -> Model 01 (Stage) -> Model 02 (Timeline) -> Estimated Flowering Date.
    Also automatically persists prediction record to Supabase database table 'prediction_history'.
    """
    from datetime import datetime
    try:
        content1 = await image1.read()
        content2 = await image2.read()
        content3 = await image3.read()

        image_tuples = [
            (image1.filename or "image1.jpg", content1),
            (image2.filename or "image2.jpg", content2),
            (image3.filename or "image3.jpg", content3)
        ]

        plant_id = None
        module_id = None
        sensor_input_obj: Optional[Model02SensorInput] = None
        if sensor_data:
            try:
                data_dict = json.loads(sensor_data)
                plant_id = data_dict.get("plant_id")
                module_id = data_dict.get("module_id")
                data_dict["current_stage"] = "Seedling"  # placeholder for schema validation
                sensor_input_obj = Model02SensorInput(**data_dict)
            except Exception as pe:
                print(f"[Warning] Failed to parse sensor_data JSON: {pe}")

        bloom_svc = get_bloom_prediction_service()
        bloom_result = bloom_svc.predict_full_bloom_workflow(image_tuples, sensor_input_obj)

        # Automatically save prediction record directly to Supabase DB
        try:
            from app.config import settings
            from app.services.supabase_service import save_prediction_history_to_supabase

            db_record = {
                "plant_id": plant_id or "029282a6-ecbe-441f-84c0-ce107f6470d9",
                "module_id": module_id or "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
                "current_stage": bloom_result.current_stage,
                "estimated_flowering_date": bloom_result.estimated_flowering_date,
                "flowering_date_range_display": bloom_result.flowering_date_range_display,
                "total_days_to_flowering": bloom_result.total_days_to_flowering,
                "display_total_days": bloom_result.display_total_days,
                "confidence": bloom_result.model01_result.overall_confidence if bloom_result.model01_result else 0.95,
                "timeline": [t.dict() for t in bloom_result.timeline] if bloom_result.timeline else [],
                "sensor_summary": bloom_result.sensor_summary.dict() if bloom_result.sensor_summary else {},
                "created_at": datetime.now().isoformat()
            }
            await save_prediction_history_to_supabase(settings.SUPABASE_URL, settings.SUPABASE_KEY, db_record)
        except Exception as dbe:
            print(f"[Warning] Failed to save prediction to Supabase DB: {dbe}")

        return bloom_result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bloom prediction error: {str(e)}")

@router.post("/parse-sensor-data", status_code=status.HTTP_200_OK)
async def parse_sensor_data_file(sensor_file: UploadFile = File(...)):
    """
    Utility endpoint allowing users to upload manual IoT sensor log files (CSV or JSON).
    Returns calculated summary statistics for Model 02 inputs.
    """
    filename = sensor_file.filename or ""
    content = await sensor_file.read()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(".json"):
            df = pd.read_json(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and JSON sensor data files are supported.")

        summary = {}
        cols = {c.lower(): c for c in df.columns}

        # Temperature
        temp_col = next((cols[c] for c in cols if "temp" in c), None)
        if temp_col:
            summary["avg_temp_c"] = float(df[temp_col].mean())
            summary["min_temp_c"] = float(df[temp_col].min())
            summary["max_temp_c"] = float(df[temp_col].max())
            summary["temp_std_c"] = float(df[temp_col].std() if len(df) > 1 else 0.0)

        # Humidity
        hum_col = next((cols[c] for c in cols if "hum" in c or "rh" in c), None)
        if hum_col:
            summary["avg_humidity_rh"] = float(df[hum_col].mean())
            summary["min_humidity_rh"] = float(df[hum_col].min())
            summary["max_humidity_rh"] = float(df[hum_col].max())
            summary["humidity_std_rh"] = float(df[hum_col].std() if len(df) > 1 else 0.0)

        # Light
        light_col = next((cols[c] for c in cols if "light" in c or "lux" in c), None)
        if light_col:
            summary["avg_light_lux"] = float(df[light_col].mean())
            summary["min_light_lux"] = float(df[light_col].min())
            summary["max_light_lux"] = float(df[light_col].max())
            summary["light_std_lux"] = float(df[light_col].std() if len(df) > 1 else 0.0)

        return {"parsed_summary": summary, "rows_processed": len(df)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse IoT sensor file: {str(e)}")

# ==============================================================================
# SUPABASE IOT DATA ENDPOINTS
# ==============================================================================

@router.post("/supabase/parse-readings", status_code=status.HTTP_200_OK)
def parse_supabase_readings(req: SupabaseParseRawRequest):
    """
    Parses a raw Supabase reading JSON payload (list of objects with temperature, humidity, created_at)
    and computes aggregated statistics (mean, min, max, std dev) for Model 02 inputs.
    """
    try:
        stats = compute_reading_stats(req.readings)
        return {"status": "success", "sensor_summary": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Supabase readings: {str(e)}")

@router.post("/supabase/fetch-readings", status_code=status.HTTP_200_OK)
async def fetch_supabase_readings_endpoint(req: SupabaseFetchRequest):
    """
    Connects directly to your Supabase project REST API, fetches 7-day hourly IoT readings
    from the 'readings' table (filtered by plant_id and module_id in chronological order),
    and returns calculated Model 02 feature inputs.
    """
    try:
        stats = await fetch_supabase_readings(
            req.supabase_url, 
            req.supabase_key, 
            plant_id=req.plant_id, 
            module_id=req.module_id,
            days=req.days,
            limit=req.limit
        )
        return {"status": "success", "sensor_summary": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Supabase IoT data: {str(e)}")

@router.post("/supabase/plants", status_code=status.HTTP_200_OK)
async def fetch_supabase_plants_endpoint(req: SupabasePlantsRequest):
    """
    Fetches the list of active plants from your Supabase project 'plants' table.
    """
    try:
        plants = await fetch_supabase_plants(req.supabase_url, req.supabase_key, req.user_id)
        return {"status": "success", "plants": plants}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Supabase plants: {str(e)}")

@router.post("/supabase/modules", status_code=status.HTTP_200_OK)
async def fetch_supabase_modules_endpoint(req: SupabaseModulesRequest):
    """
    Fetches the list of active IoT modules from your Supabase project 'modules' table.
    """
    try:
        modules = await fetch_supabase_modules(req.supabase_url, req.supabase_key, req.user_id)
        return {"status": "success", "modules": modules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Supabase modules: {str(e)}")

@router.post("/supabase/save-history", status_code=status.HTTP_200_OK)
async def save_prediction_history_endpoint(record: Dict[str, Any]):
    """
    Saves a prediction record exclusively to Supabase 'prediction_history' table.
    """
    from app.config import settings
    from app.services.supabase_service import save_prediction_history_to_supabase

    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY

    saved_sb = await save_prediction_history_to_supabase(supabase_url, supabase_key, record)
    return {"status": "success", "saved_to_supabase": saved_sb}

@router.get("/supabase/fetch-history", status_code=status.HTTP_200_OK)
async def fetch_prediction_history_endpoint():
    """
    Fetches prediction history records exclusively from Supabase table 'prediction_history'.
    """
    from app.config import settings
    from app.services.supabase_service import fetch_prediction_history_from_supabase

    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY

    sb_records = await fetch_prediction_history_from_supabase(supabase_url, supabase_key)
    return {"status": "success", "history": sb_records, "source": "supabase"}

@router.post("/supabase/clear-history", status_code=status.HTTP_200_OK)
async def clear_prediction_history_endpoint():
    """
    Clears all prediction history records exclusively from Supabase table 'prediction_history'.
    """
    from app.config import settings
    from app.services.supabase_service import clear_prediction_history_in_supabase

    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY

    cleared = await clear_prediction_history_in_supabase(supabase_url, supabase_key)
    return {"status": "success", "cleared_in_supabase": cleared}
