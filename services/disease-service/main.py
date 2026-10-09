import io
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model_service import load_disease_models, predict_disease_ensemble
from database import (
    save_diagnosis,
    get_user_diagnoses,
    get_plant_diagnoses,
    get_diagnosis_by_id,
    soft_delete_diagnosis,
    get_npk_window_for_plant,
    save_npk_reading,
)
from mqtt_consumer import start_mqtt_subscriber

DISEASE_CONFIDENCE_THRESHOLD = 0.6

RECOMMENDATIONS = {
    "black_rot": {
        "label": "Black Rot",
        "disease_info": "Black Rot detected. Fungal infection on orchid tissue.",
        "treatment": [
            "Remove infected tissue with sterilized tools immediately",
            "Reduce excess moisture; improve air circulation",
            "If you have neem oil, apply it to the infected spots.",
            "Apply proper fungicide (copper octanoate, phosphorous acid, copper ammonium complex — check label compatibility)",
            "Isolate infected plant to prevent spread",
        ],
    },
    "bacterial_brown_spot": {
        "label": "Bacterial Brown Spot",
        "disease_info": "Bacterial Brown Spot detected.",
        "treatment": [
            "Apply hydrogen peroxide to localized spots",
            "Remove infected tissue with a sterile blade (severe cases)",
            "Apply chemical treatment (Dithane M-45, Manzate, Captan 50 WP, or Captaf — per label instructions)",
            "Avoid copper-based products on Dendrobiums",
        ],
    },
    "healthy": {
        "label": "Healthy",
        "disease_info": "No disease detected. Leaf appears healthy.",
        "treatment": ["Continue current care routine"],
    },
    "invalid": {
        "label": "Invalid image",
        "disease_info": "The upload does not look like a valid orchid leaf.",
        "treatment": ["Retake a clear close-up of a single orchid leaf and try again"],
    },
}

app = FastAPI(
    title="Orchid Disease & Treatment Service",
    description="Microservice for orchid leaf disease diagnosis (YOLO + MobileNetV2 + CNN Ensemble) and treatment recommendation by IT22250124",
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
        load_disease_models()
        print("[DiseaseService] Ensemble models loaded successfully.")
    except Exception as e:
        print(f"[DiseaseService] Warning: Could not preload models: {e}")

    # Launch background MQTT listener for NPK sensor telemetry
    start_mqtt_subscriber()


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "service": "Orchid Disease & Treatment Service",
        "status": "healthy",
        "ensemble_models": ["YOLO Detection", "MobileNetV2", "Custom CNN"],
        "mqtt_enabled": True,
    }


def _decide_verdict(predicted_class: str, confidence: float) -> str:
    if predicted_class in ("healthy", "invalid"):
        return "HEALTHY"
    if confidence >= DISEASE_CONFIDENCE_THRESHOLD:
        return "DISEASE"
    return "HEALTHY"


# ==============================================================================
# MAIN DIAGNOSIS ENDPOINT
# ==============================================================================

@app.post("/analyze", tags=["Diagnosis"])
@app.post("/api/disease/analyze", tags=["Diagnosis"])
async def analyze_disease(
    plant_id: str = Form(...),
    image: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Analyzes an orchid leaf photo using the YOLO + MobileNetV2 + CNN ensemble,
    evaluates soil NPK nutritional status from the 7-day telemetry window,
    and returns localized treatments and diagnostic visualizations.
    """
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    try:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid image format: {e}")

    # 1. Run local ensemble inference
    pred = predict_disease_ensemble(pil_img)
    predicted_class = pred["predicted_class"]
    confidence = float(pred["confidence"])

    rec = RECOMMENDATIONS.get(predicted_class, RECOMMENDATIONS["healthy"])
    verdict = _decide_verdict(predicted_class, confidence)
    conf_pct = round(confidence * 100, 2)

    if verdict == "DISEASE":
        verdict_msg = f"{rec['label']} detected ({conf_pct:.0f}% confidence) — here's the treatment."
    elif predicted_class == "invalid":
        verdict_msg = rec["disease_info"]
    elif predicted_class not in ("healthy", "invalid") and confidence < DISEASE_CONFIDENCE_THRESHOLD:
        verdict_msg = f"Possible {rec['label']} at {conf_pct:.0f}% confidence (below threshold) — treating as healthy."
    else:
        verdict_msg = f"Leaf looks healthy ({conf_pct:.0f}% confidence)."

    # 2. Correlate with 7-day soil NPK window
    effective_user_id = user_id or x_user_id or "anonymous"
    npk_pack = get_npk_window_for_plant(plant_id=plant_id, user_id=effective_user_id)
    npk = npk_pack["latest"]
    npk_status = npk_pack["latest_status"]
    npk_advice = npk_pack["latest_advice"]
    npk_window = npk_pack["window"]

    payload = {
        "user_id": effective_user_id,
        "plant_id": plant_id,
        "verdict": verdict,
        "disease_name": rec["label"],
        "disease_info": rec["disease_info"],
        "confidence": conf_pct,
        "treatment": rec["treatment"],
        "npk_reading": {"latest": npk, "window": npk_window},
        "npk_status": npk_status,
        "npk_advice": npk_advice,
        "result_image_b64": pred["result_image"],
    }

    # 3. Persist record to Supabase
    saved_record = save_diagnosis(payload)

    return {
        "verdict": verdict,
        "verdict_msg": verdict_msg,
        "disease_name": rec["label"],
        "disease_info": rec["disease_info"],
        "confidence": conf_pct,
        "treatment": rec["treatment"],
        "npk": npk,
        "npk_status": npk_status,
        "npk_advice": npk_advice,
        "npk_window": npk_window,
        "result_image": pred["result_image"],
        "ensemble": {
            "predicted_class": predicted_class,
            "confidence": round(confidence, 4),
            "threshold": DISEASE_CONFIDENCE_THRESHOLD,
            "yolo": pred.get("yolo"),
            "mobilenet": pred.get("mobilenet"),
            "cnn": pred.get("cnn"),
            "ensemble_probs": pred.get("ensemble_probs"),
        },
        "record": saved_record,
    }


# ==============================================================================
# TELEMETRY & HISTORY QUERY ENDPOINTS
# ==============================================================================

@app.get("/plant/{plant_id}/npk-history", tags=["NPK Telemetry"])
def get_plant_npk_history(
    plant_id: str,
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Fetch 7-day NPK window and nutritional status for a plant."""
    pack = get_npk_window_for_plant(plant_id, user_id=user_id or x_user_id)
    return {
        "data": pack["rows"],
        "total": len(pack["rows"]),
        "days": 7,
        "window": pack["window"],
    }


@app.post("/npk-reading", tags=["NPK Telemetry"])
def ingest_npk_reading(
    nitrogen: float = Form(...),
    phosphorus: float = Form(...),
    potassium: float = Form(...),
    plant_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Direct REST endpoint for posting an NPK reading (alternative to MQTT)."""
    saved = save_npk_reading(
        nitrogen=nitrogen,
        phosphorus=phosphorus,
        potassium=potassium,
        plant_id=plant_id,
        user_id=user_id or x_user_id,
    )
    return {"status": "success", "record": saved}


@app.get("/plant/{plant_id}", tags=["History"])
def get_plant_history(
    plant_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    include_npk: bool = Query(False),
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Fetch paginated disease diagnostic history for a specific plant."""
    result = get_plant_diagnoses(plant_id, page=page, limit=limit)
    if include_npk:
        pack = get_npk_window_for_plant(plant_id, user_id=user_id or x_user_id)
        result["npk_data"] = pack["rows"]
        result["npk_window"] = pack["window"]
        result["days"] = 7
    return result


@app.get("/history", tags=["History"])
def get_user_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Fetch all disease diagnosis records for the user."""
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id query param or X-User-Id header required.")
    return get_user_diagnoses(user_id=effective_user_id)


@app.get("/{analysis_id}", tags=["History"])
def get_diagnosis(analysis_id: str):
    record = get_diagnosis_by_id(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Diagnosis record not found.")
    return record


@app.delete("/{analysis_id}", tags=["History"])
def delete_diagnosis(analysis_id: str):
    ok = soft_delete_diagnosis(analysis_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Record not found or already deleted.")
    return {"message": "Disease record soft deleted successfully."}
