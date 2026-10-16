import os
from typing import Dict, Any, Optional
import pandas as pd
import joblib

# Sklearn compatibility patch for version differences (1.6.1 vs 1.8.0)
import sklearn
import sklearn.compose._column_transformer
if not hasattr(sklearn.compose._column_transformer, '_RemainderColsList'):
    class _RemainderColsList(list):
        pass
    sklearn.compose._column_transformer._RemainderColsList = _RemainderColsList

from sklearn.impute import SimpleImputer
if not hasattr(SimpleImputer, '_fill_dtype'):
    SimpleImputer._fill_dtype = property(lambda self: getattr(self, '_fit_dtype', None))

from app.config import MODEL02_PATH, MODEL02_FEATURE_ORDER, NEXT_STAGE_MAP
from app.schemas.prediction import Model02SensorInput, TransitionPredictionResponse
from app.utils.date_utils import get_current_date, format_date_display, add_days_to_date

class Model02Service:
    def __init__(self, model_path: str = MODEL02_PATH):
        self.model_path = model_path
        self.pipeline = None
        self.load_model()

    def load_model(self):
        """Load Gradient Boosting pipeline ONCE at startup."""
        print(f"[Model 02] Loading Gradient Boosting pipeline from {self.model_path}...")
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model 02 file not found at: {self.model_path}")
        try:
            self.pipeline = joblib.load(self.model_path)
            print(f"[Model 02] Loaded successfully. Type: {type(self.pipeline)}")
        except Exception as e:
            print(f"[Model 02] Error loading Gradient Boosting pipeline: {e}")
            raise e

    def predict_transition(self, sensor_input: Model02SensorInput) -> TransitionPredictionResponse:
        """
        Predict transition duration (in days) from current_stage to next_stage.
        Must use the exact 15 feature vector order expected by the trained model.
        """
        current_stage = sensor_input.current_stage
        next_stage = NEXT_STAGE_MAP.get(current_stage)

        if current_stage == "Flowering":
            return TransitionPredictionResponse(
                current_stage="Flowering",
                next_stage=None,
                predicted_transition_days=0.0,
                display_days=0,
                start_date=format_date_display(get_current_date()),
                estimated_next_stage_date=None,
                message="Your Dendrobium orchid is currently flowering."
            )

        if next_stage is None:
            raise ValueError(f"Invalid current_stage '{current_stage}'. Must be one of Seedling, Vegetative, Mature_Pseudobulb, Bud_formation, Flowering.")

        # Construct dictionary adhering strictly to MODEL02_FEATURE_ORDER
        feature_dict = {
            "current_stage": current_stage,
            "month": sensor_input.month,
            "day_of_year": sensor_input.day_of_year,
            "avg_temp_c": sensor_input.avg_temp_c,
            "min_temp_c": sensor_input.min_temp_c,
            "max_temp_c": sensor_input.max_temp_c,
            "temp_std_c": sensor_input.temp_std_c,
            "avg_humidity_rh": sensor_input.avg_humidity_rh,
            "min_humidity_rh": sensor_input.min_humidity_rh,
            "max_humidity_rh": sensor_input.max_humidity_rh,
            "humidity_std_rh": sensor_input.humidity_std_rh,
            "avg_light_lux": sensor_input.avg_light_lux,
            "min_light_lux": sensor_input.min_light_lux,
            "max_light_lux": sensor_input.max_light_lux,
            "light_std_lux": sensor_input.light_std_lux,
        }

        # Build DataFrame with exact feature order
        df = pd.DataFrame([feature_dict])[MODEL02_FEATURE_ORDER]

        # Run pipeline inference
        raw_pred = self.pipeline.predict(df)[0]
        predicted_days = float(max(0.1, raw_pred))  # Ensure positive duration
        display_days = round(predicted_days)

        start_dt = get_current_date()
        next_stage_dt = add_days_to_date(start_dt, predicted_days)

        return TransitionPredictionResponse(
            current_stage=current_stage,
            next_stage=next_stage,
            predicted_transition_days=predicted_days,
            display_days=display_days,
            start_date=format_date_display(start_dt),
            estimated_next_stage_date=format_date_display(next_stage_dt),
            message=f"Predicted transition from {current_stage} to {next_stage} in {display_days} days."
        )

# Global singleton instance loaded once
_model02_instance: Optional[Model02Service] = None

def get_model02_service() -> Model02Service:
    global _model02_instance
    if _model02_instance is None:
        _model02_instance = Model02Service()
    return _model02_instance
