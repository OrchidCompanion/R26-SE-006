# routers/species.py
import os
import io
import base64
from typing import List, Optional
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from ultralytics import YOLO
from PIL import Image

from utils.auth import get_current_user

router = APIRouter(prefix="/api/species", tags=["Species Identification"])

# Locate model in ../models/YOLO11n.pt (or fallback to ./models/YOLO11n.pt)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "YOLO11n.pt")

if not os.path.exists(MODEL_PATH):
    # Secondary check in parent directory
    MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "models", "YOLO11n.pt"))

if not os.path.exists(MODEL_PATH):
    print(f"⚠️ Warning: Model weights not found at expected path: {MODEL_PATH}")
    model = None
else:
    model = YOLO(MODEL_PATH)


@router.post("/identify")
async def identify_orchid_species(
    files: List[UploadFile] = File(
        ..., description="Upload 1 to 5 images for batch detection"
    ),
    conf_threshold: float = 0.35,
    current_user: dict = Depends(get_current_user),
):
    """
    Accepts 1 or multiple images (e.g. 2 angles of a plant),
    runs YOLO11n inference, and returns identified bounding boxes & consensus verdict.
    """
    if not model:
        raise HTTPException(
            status_code=500,
            detail="YOLO11n model weights not found on server. Ensure YOLO11n.pt is in the models folder.",
        )

    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    overall_results = []
    species_detected_counts = {}

    for file in files:
        try:
            image_bytes = await file.read()
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image format for {file.filename}: {str(e)}",
            )

        # Run inference on PIL Image
        preds = model.predict(source=pil_image, conf=conf_threshold, imgsz=640)
        result = preds[0]
        boxes = result.boxes

        detections = []
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()  # [xmin, ymin, xmax, ymax]

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

        # Draw annotated preview image as base64 string
        annotated_bgr = result.plot()
        annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])
        buffered = io.BytesIO()
        annotated_rgb.save(buffered, format="JPEG")
        img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

        overall_results.append(
            {
                "filename": file.filename,
                "detected_count": len(detections),
                "detections": detections,
                "annotated_image": f"data:image/jpeg;base64,{img_b64}",
            }
        )

    # Determine aggregated verdict across multiple images
    if species_detected_counts:
        top_species = max(species_detected_counts, key=species_detected_counts.get)
        verdict = f"Identified as {top_species.capitalize()} orchid"
    else:
        verdict = (
            "No orchid detected (No Dendrobium, Phalaenopsis, or Oncidium recognized)"
        )

    return {
        "status": "success",
        "verdict": verdict,
        "total_images_processed": len(overall_results),
        "results": overall_results,
    }
