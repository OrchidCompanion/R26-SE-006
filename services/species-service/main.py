import os
import io
import base64
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, File, UploadFile, Form, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

from database import (
    save_identification_log,
    get_user_identification_history,
    create_plant_record,
    get_plants_list,
    get_plant_by_id,
    update_plant_record,
    soft_delete_plant_record,
)

app = FastAPI(
    title="Orchid Species Identification Service",
    description="Microservice for orchid species classification (Dendrobium, Phalaenopsis, Oncidium) by IT22140616",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PlantCreate(BaseModel):
    plant_name: str
    plant_species: str
    plant_location: Optional[str] = None
    location_id: Optional[str] = None
    user_id: Optional[str] = None

class PlantUpdate(BaseModel):
    plant_name: Optional[str] = None
    plant_species: Optional[str] = None
    plant_location: Optional[str] = None
    location_id: Optional[str] = None


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "species-identification.pt"

_species_model: Optional[YOLO] = None


def get_model() -> YOLO:
    global _species_model
    if _species_model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
        print(f"[SpeciesService] Loading YOLO model from {MODEL_PATH}...")
        _species_model = YOLO(str(MODEL_PATH))
    return _species_model


@app.on_event("startup")
async def startup_event():
    try:
        get_model()
        print("[SpeciesService] YOLO model preloaded successfully.")
    except Exception as e:
        print(f"[SpeciesService] Warning: Could not preload model on startup: {e}")


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    model_loaded = _species_model is not None
    return {
        "service": "Orchid Species Identification Service",
        "status": "healthy",
        "model_loaded": model_loaded,
        "supported_species": ["Dendrobium", "Phalaenopsis", "Oncidium"],
    }


@app.get("/species/info", tags=["Species Info"])
def get_species_info():
    """Information and care guidelines for the supported orchid genera."""
    return {
        "Dendrobium": {
            "cane_structure": "Tall, jointed cane-like pseudobulbs with alternating side leaves",
            "light_req": "High indirect light (20,000 - 30,000 Lux)",
            "temp_req": "Warm (24 - 30°C day, 18 - 22°C night)",
            "humidity_req": "50% - 70%",
        },
        "Phalaenopsis": {
            "leaf_structure": "Monopodial rosette, broad leathery leaves with central crown",
            "light_req": "Medium indirect light (10,000 - 18,000 Lux)",
            "temp_req": "Moderate (22 - 28°C day, 16 - 19°C night)",
            "humidity_req": "60% - 75%",
        },
        "Oncidium": {
            "bulb_structure": "Distinct oval or flattened basal pseudobulbs with slender strap-like leaves",
            "light_req": "Bright filtered light (18,000 - 28,000 Lux)",
            "temp_req": "Moderate to cool (20 - 26°C day, 14 - 18°C night)",
            "humidity_req": "55% - 70%",
        },
    }


@app.post("/identify", tags=["Inference"])
@app.post("/api/species/identify", tags=["Inference"])
async def identify_orchid_species(
    files: List[UploadFile] = File(...),
    conf_threshold: float = Query(0.35, ge=0.05, le=0.95),
    user_id: Optional[str] = Form(None),
    plant_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Accepts 1 to 5 orchid images, runs YOLO detection, and returns bounding boxes,
    species verdict, and base64 annotated visualizations.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image files provided for identification.",
        )

    model = get_model()
    effective_user_id = user_id or x_user_id

    overall_results: List[Dict[str, Any]] = []
    species_detected_counts: Dict[str, int] = {}
    uploaded_filenames: List[str] = []

    for file in files:
        content = await file.read()
        if not content:
            continue

        uploaded_filenames.append(file.filename or "unknown.jpg")
        try:
            pil_image = Image.open(io.BytesIO(content)).convert("RGB")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not decode image '{file.filename}': {str(e)}",
            )

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

                species_detected_counts[cls_name] = (
                    species_detected_counts.get(cls_name, 0) + 1
                )
                detections.append(
                    {
                        "species": cls_name,
                        "confidence": round(conf, 4),
                        "confidence_percentage": f"{conf * 100:.1f}%",
                        "box": {
                            "xmin": round(xyxy[0], 1),
                            "ymin": round(xyxy[1], 1),
                            "xmax": round(xyxy[2], 1),
                            "ymax": round(xyxy[3], 1),
                        },
                    }
                )

        # Generate annotated image
        annotated_bgr = result.plot()
        annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])
        buf = io.BytesIO()
        annotated_rgb.save(buf, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        overall_results.append(
            {
                "filename": file.filename,
                "detected_count": len(detections),
                "detections": detections,
                "annotated_image": f"data:image/jpeg;base64,{img_b64}",
            }
        )

    verdict = (
        f"Identified as {max(species_detected_counts, key=species_detected_counts.get).capitalize()} orchid"
        if species_detected_counts
        else "No orchid detected (No Dendrobium, Phalaenopsis, or Oncidium recognized)"
    )

    response_payload = {
        "status": "success",
        "verdict": verdict,
        "total_images_processed": len(overall_results),
        "results": overall_results,
    }

    # Asynchronously persist result to Supabase if DB credentials exist
    try:
        save_identification_log(
            verdict=verdict,
            total_images=len(overall_results),
            detections_summary=species_detected_counts,
            user_id=effective_user_id,
            plant_id=plant_id,
            image_filenames=uploaded_filenames,
        )
    except Exception as e:
        print(f"[SpeciesService] Log save skipped: {e}")

    return response_payload


@app.get("/history", tags=["History"])
def get_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    limit: int = Query(20, ge=1, le=100),
):
    """Retrieve historical identification logs for a user."""
    effective_user_id = user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id query parameter or X-User-Id header is required.",
        )
    return get_user_identification_history(user_id=effective_user_id, limit=limit)


# ==============================================================================
# Plants Catalog API Endpoints
# ==============================================================================

@app.post("/plants", status_code=status.HTTP_201_CREATED, tags=["Plants"])
@app.post("/api/plants", status_code=status.HTTP_201_CREATED, tags=["Plants"])
def create_plant(
    plant: PlantCreate,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    effective_user_id = plant.user_id or x_user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    
    created = create_plant_record(
        plant_name=plant.plant_name,
        plant_species=plant.plant_species,
        user_id=effective_user_id,
        plant_location=plant.plant_location,
        location_id=plant.location_id,
    )
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create plant.")
    created["plant_id"] = str(created.get("plant_id"))
    return created


@app.get("/plants", tags=["Plants"])
@app.get("/api/plants", tags=["Plants"])
def get_plants(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    is_admin: bool = Query(False),
):
    effective_user_id = user_id or x_user_id
    plants = get_plants_list(user_id=effective_user_id, is_admin=is_admin)
    for p in plants:
        p["plant_id"] = str(p.get("plant_id"))
    return plants


@app.get("/plants/{plant_id}", tags=["Plants"])
@app.get("/api/plants/{plant_id}", tags=["Plants"])
def get_plant_details(plant_id: str):
    plant = get_plant_by_id(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found.")
    plant["plant_id"] = str(plant.get("plant_id"))
    return plant


@app.put("/plants/{plant_id}", tags=["Plants"])
@app.put("/api/plants/{plant_id}", tags=["Plants"])
def update_plant(plant_id: str, data: PlantUpdate):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    updated = update_plant_record(plant_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Plant not found or update failed.")
    updated["plant_id"] = str(updated.get("plant_id"))
    return updated


@app.delete("/plants/{plant_id}", tags=["Plants"])
@app.delete("/api/plants/{plant_id}", tags=["Plants"])
def delete_plant(plant_id: str):
    success = soft_delete_plant_record(plant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Plant not found.")
    return {"message": "Plant deleted successfully."}

