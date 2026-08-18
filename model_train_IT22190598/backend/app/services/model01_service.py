import io
import os
from typing import List, Dict, Tuple, Optional
from PIL import Image
import numpy as np
from ultralytics import YOLO

from app.config import MODEL01_PATH, CONFIDENCE_THRESHOLD, YOLO_CLASS_MAP, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES
from app.schemas.prediction import ImagePrediction, Model01DetectionResponse

class Model01Service:
    def __init__(self, model_path: str = MODEL01_PATH):
        self.model_path = model_path
        self.model = None
        self.load_model()

    def load_model(self):
        """Load YOLO best.pt model ONCE at startup."""
        print(f"[Model 01] Loading YOLO model from {self.model_path}...")
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model 01 file not found at: {self.model_path}")
        try:
            self.model = YOLO(self.model_path)
            print(f"[Model 01] Loaded successfully. Classes: {self.model.names}")
        except Exception as e:
            print(f"[Model 01] Error loading YOLO model: {e}")
            raise e

    def validate_file(self, filename: str, content_bytes: bytes) -> Optional[str]:
        """Validate uploaded file type and size."""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return f"Invalid file type '{ext}'. Please upload JPG, JPEG, PNG, or WEBP images."
        if len(content_bytes) > MAX_FILE_SIZE_BYTES:
            return f"File size exceeds limit of 10 MB."
        return None

    def predict_single_image(self, image_bytes: bytes, filename: str, image_index: int) -> ImagePrediction:
        """Run YOLO inference on a single image byte stream."""
        validation_error = self.validate_file(filename, image_bytes)
        if validation_error:
            return ImagePrediction(
                image_index=image_index,
                filename=filename,
                stage="Unknown",
                confidence=0.0,
                raw_class_name="None",
                is_valid=False,
                error_message=f"Image {image_index} error: {validation_error}"
            )

        try:
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            # Run YOLO prediction
            results = self.model.predict(source=pil_img, imgsz=640, verbose=False)[0]

            # Classification model check vs Detection model check
            if hasattr(results, "probs") and results.probs is not None:
                top_idx = int(results.probs.top1)
                conf = float(results.probs.top1conf)
            elif hasattr(results, "boxes") and results.boxes is not None and len(results.boxes) > 0:
                # Detection model: take box with highest confidence
                confs = results.boxes.conf.cpu().numpy()
                cls_indices = results.boxes.cls.cpu().numpy()
                best_idx = np.argmax(confs)
                top_idx = int(cls_indices[best_idx])
                conf = float(confs[best_idx])
            else:
                return ImagePrediction(
                    image_index=image_index,
                    filename=filename,
                    stage="Unknown",
                    confidence=0.0,
                    raw_class_name="None",
                    is_valid=False,
                    error_message=f"Image {image_index} could not be confidently identified. Please upload a clear Dendrobium orchid image."
                )

            raw_class_name = self.model.names.get(top_idx, str(top_idx))
            mapped_stage = YOLO_CLASS_MAP.get(top_idx, raw_class_name)

            if conf < CONFIDENCE_THRESHOLD:
                return ImagePrediction(
                    image_index=image_index,
                    filename=filename,
                    stage="Low Confidence",
                    confidence=conf,
                    raw_class_name=raw_class_name,
                    is_valid=False,
                    error_message=f"Image {image_index} confidence ({conf:.1%}) is below required threshold ({CONFIDENCE_THRESHOLD:.1%}). Please upload a clearer image."
                )

            return ImagePrediction(
                image_index=image_index,
                filename=filename,
                stage=mapped_stage,
                confidence=conf,
                raw_class_name=raw_class_name,
                is_valid=True
            )

        except Exception as e:
            return ImagePrediction(
                image_index=image_index,
                filename=filename,
                stage="Error",
                confidence=0.0,
                raw_class_name="Error",
                is_valid=False,
                error_message=f"Image {image_index} processing failed: {str(e)}"
            )

    def process_three_images(self, image_tuples: List[Tuple[str, bytes]]) -> Model01DetectionResponse:
        """
        Process 3 images individually and apply confidence-weighted majority voting.
        image_tuples: List of (filename, content_bytes) of length 3.
        """
        if len(image_tuples) != 3:
            raise ValueError("Model 01 requires exactly three images for stage determination.")

        predictions: List[ImagePrediction] = []
        for idx, (filename, bytes_data) in enumerate(image_tuples, start=1):
            pred = self.predict_single_image(bytes_data, filename, idx)
            predictions.append(pred)

        # Check if any image failed validation
        failed_preds = [p for p in predictions if not p.is_valid]
        if failed_preds:
            fail_msgs = [p.error_message for p in failed_preds if p.error_message]
            return Model01DetectionResponse(
                image_predictions=predictions,
                final_stage="Invalid",
                summary_message=" | ".join(fail_msgs),
                all_valid=False
            )

        # Confidence-aware majority voting across valid predictions
        stage_scores: Dict[str, float] = {}
        stage_counts: Dict[str, int] = {}

        for p in predictions:
            stage_scores[p.stage] = stage_scores.get(p.stage, 0.0) + p.confidence
            stage_counts[p.stage] = stage_counts.get(p.stage, 0) + 1

        # Pick stage with highest combined confidence score
        final_stage = max(stage_scores.keys(), key=lambda s: stage_scores[s])
        majority_count = stage_counts[final_stage]
        avg_conf = stage_scores[final_stage] / majority_count

        summary_msg = f"Final Stage determined as '{final_stage}' via confidence-weighted voting ({majority_count}/3 images matched, avg confidence: {avg_conf:.1%})."

        return Model01DetectionResponse(
            image_predictions=predictions,
            final_stage=final_stage,
            summary_message=summary_msg,
            all_valid=True
        )

# Global singleton instance loaded once
_model01_instance: Optional[Model01Service] = None

def get_model01_service() -> Model01Service:
    global _model01_instance
    if _model01_instance is None:
        _model01_instance = Model01Service()
    return _model01_instance
