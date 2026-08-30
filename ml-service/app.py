import os
import io
import base64
from typing import List
from fastapi import FastAPI, File, UploadFile, HTTPException
from ultralytics import YOLO
from PIL import Image

app = FastAPI(title="Orchid Species Inference Service")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "species-identification.pt")

try:
    model = YOLO(MODEL_PATH)
except Exception as e:
    raise RuntimeError(f"Failed to load model: {e}")

@app.get("/")
def health_check():
    return {"status": "running"}

@app.post("/predict")
async def predict_species(
    files: List[UploadFile] = File(...),
    conf_threshold: float = 0.35,
):
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

    if species_detected_counts:
        top_species = max(species_detected_counts, key=species_detected_counts.get)
        verdict = f"Identified as {top_species.capitalize()} orchid"
    else:
        verdict = "No orchid detected (No Dendrobium, Phalaenopsis, or Oncidium recognized)"

    return {
        "status": "success",
        "verdict": verdict,
        "total_images_processed": len(overall_results),
        "results": overall_results,
    }