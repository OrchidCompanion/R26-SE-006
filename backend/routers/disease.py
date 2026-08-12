import os
import tempfile
import base64
import numpy as np
import cv2
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from ultralytics import YOLO
from ultralytics.utils import checks

checks.check_requirements = lambda *args, **kwargs: True

from database import supabase
from utils.auth import get_current_user

router = APIRouter(prefix="/api/disease", tags=["Disease Analysis & History"])

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
ONNX_MODEL_PATH = os.path.join(MODELS_DIR, "disease-yolo26-best.onnx")

model = None


def get_yolo_model():
    global model
    if model is None:
        model = YOLO(ONNX_MODEL_PATH, task="detect")
    return model


NPK_THRESHOLDS = {
    "N": {"low": 25, "high": 65},
    "P": {"low": 15, "high": 35},
    "K": {"low": 50, "high": 130},
}

RECOMMENDATIONS = {
    "black_rot": {
        "disease_info": "Black Rot detected! Fungal infection.",
        "treatment": [
            "Remove infected leaves immediately",
            "Apply copper-based fungicide",
            "Reduce watering frequency",
            "Improve air circulation",
        ],
    },
    "bacterial_brown_pot": {
        "disease_info": "Bacterial Brown Spot detected!",
        "treatment": [
            "Remove and destroy infected parts",
            "Apply bactericide",
            "Avoid overhead watering",
            "Sterilize cutting tools",
        ],
    },
    "healthy": {
        "disease_info": "Plant is Healthy!",
        "treatment": ["Continue current care routine"],
    },
}

CLASS_NAMES = ["bacterial_brown_pot", "black_rot", "healthy"]
COLORS = {
    "bacterial_brown_pot": (255, 0, 0),
    "black_rot": (0, 0, 255),
    "healthy": (0, 255, 0),
}


def analyze_npk(npk_data: dict):
    status_map = {}
    advice = []
    for nutrient in ("N", "P", "K"):
        val = npk_data.get(nutrient)
        if val is None or np.isnan(val):
            status_map[nutrient] = "unknown"
            continue
        low = NPK_THRESHOLDS[nutrient]["low"]
        high = NPK_THRESHOLDS[nutrient]["high"]
        if val < low:
            status_map[nutrient] = "low"
            advice.append(f"Apply {nutrient}-rich fertilizer")
        elif val > high:
            status_map[nutrient] = "high"
            advice.append(f"Reduce {nutrient} application")
        else:
            status_map[nutrient] = "ok"
            advice.append(f"{nutrient} level OK")
    return status_map, advice


@router.post("/analyze", status_code=status.HTTP_200_OK)
async def analyze_leaf_and_npk(
    plant_id: str = Form(...),
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    image_bytes = await image.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        img = cv2.imread(tmp_path)
        yolo_instance = get_yolo_model()
        results = yolo_instance(tmp_path, conf=0.25, verbose=False)

        top_class = "healthy"
        top_score = 0.0

        for r in results:
            if r.boxes is not None and len(r.boxes) > 0:
                best_box = r.boxes[0]
                cls_idx = int(best_box.cls[0])
                top_class = (
                    CLASS_NAMES[cls_idx] if cls_idx < len(CLASS_NAMES) else "healthy"
                )
                top_score = float(best_box.conf[0])

                x1, y1, x2, y2 = map(int, best_box.xyxy[0].tolist())
                color = COLORS.get(top_class, (0, 255, 0))
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    img,
                    f"{top_class} {top_score:.2f}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                )

        _, buffer = cv2.imencode(".jpg", img)
        b64_img = base64.b64encode(buffer.tobytes()).decode("utf-8")

        plant_query = (
            supabase.table("plant").select("user_id").eq("plant_id", plant_id).execute()
        )
        owner_id = (
            plant_query.data[0]["user_id"]
            if plant_query.data
            else current_user["user_id"]
        )

        npk_query = (
            supabase.table("npk_sensor")
            .select("*")
            .eq("plant_id", plant_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        npk_vals = {"N": None, "P": None, "K": None, "time": None}
        if npk_query.data:
            latest = npk_query.data[0]
            npk_vals = {
                "N": (
                    float(latest.get("nitrogen_n"))
                    if latest.get("nitrogen_n") is not None
                    else None
                ),
                "P": (
                    float(latest.get("phosphorus_p"))
                    if latest.get("phosphorus_p") is not None
                    else None
                ),
                "K": (
                    float(latest.get("potassium_k"))
                    if latest.get("potassium_k") is not None
                    else None
                ),
                "time": str(latest.get("created_at")),
            }

        npk_status, npk_advice = analyze_npk(npk_vals)
        rec = RECOMMENDATIONS.get(top_class, RECOMMENDATIONS["healthy"])
        verdict_type = "HEALTHY" if top_class == "healthy" else "DISEASE"
        confidence_val = round(top_score * 100, 2)

        db_insert = (
            supabase.table("disease_analysis")
            .insert(
                {
                    "user_id": owner_id,
                    "plant_id": plant_id,
                    "verdict": verdict_type,
                    "disease_name": top_class,
                    "disease_info": rec["disease_info"],
                    "confidence": confidence_val,
                    "treatment": rec["treatment"],
                    "npk_reading": npk_vals,
                    "npk_status": npk_status,
                    "npk_advice": npk_advice,
                    "result_image_b64": b64_img,
                }
            )
            .execute()
        )

        saved_record = db_insert.data[0] if db_insert.data else {}

        return {
            "analysis_id": saved_record.get("analysis_id"),
            "verdict": verdict_type,
            "verdict_msg": rec["disease_info"],
            "disease_info": rec["disease_info"],
            "confidence": confidence_val,
            "treatment": rec["treatment"],
            "npk": npk_vals,
            "npk_status": npk_status,
            "npk_advice": npk_advice,
            "result_image": b64_img,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/plant/{plant_id}", status_code=status.HTTP_200_OK)
def get_plant_disease_history(
    plant_id: str,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    start = (page - 1) * limit
    res = (
        supabase.table("disease_analysis")
        .select("*", count="exact")
        .eq("plant_id", plant_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(start, start + limit - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "limit": limit}


@router.delete("/{analysis_id}", status_code=status.HTTP_200_OK)
def soft_delete_analysis_record(
    analysis_id: str, current_user: dict = Depends(get_current_user)
):
    res = (
        supabase.table("disease_analysis")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("analysis_id", analysis_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"message": "Disease record soft deleted successfully."}
