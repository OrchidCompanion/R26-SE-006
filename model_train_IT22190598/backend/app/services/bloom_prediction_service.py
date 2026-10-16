from typing import List, Tuple, Optional
from datetime import datetime

from app.config import BLOOMING_STAGES, NEXT_STAGE_MAP
from app.schemas.prediction import (
    Model01DetectionResponse,
    Model02SensorInput,
    PredictBloomResponse,
    TimelineStep
)
from app.services.model01_service import get_model01_service
from app.services.model02_service import get_model02_service
from app.utils.date_utils import get_current_date, format_date_display, add_days_to_date, get_date_features

class BloomPredictionService:
    def __init__(self):
        self.model01_svc = get_model01_service()
        self.model02_svc = get_model02_service()

    def predict_full_bloom_workflow(
        self,
        image_tuples: List[Tuple[str, bytes]],
        sensor_input: Optional[Model02SensorInput] = None
    ) -> PredictBloomResponse:
        """
        Full workflow:
        3 Images -> Model 01 -> Current Blooming Stage -> Model 02 (iterative transitions to Flowering) -> Timeline -> Estimated Flowering Date (+- 5 Days Range)
        """
        # Step 1: Model 01 3-image stage detection
        model01_res: Model01DetectionResponse = self.model01_svc.process_three_images(image_tuples)

        current_date_dt = get_current_date()
        current_date_str = format_date_display(current_date_dt)

        if not model01_res.all_valid:
            return PredictBloomResponse(
                model01_result=model01_res,
                current_stage="Invalid",
                is_flowering=False,
                flowering_message=model01_res.summary_message,
                timeline=[],
                total_days_to_flowering=0.0,
                display_total_days=0,
                current_date=current_date_str,
                estimated_flowering_date=None
            )

        initial_stage = model01_res.final_stage

        # Terminal check: If stage is Flowering
        if initial_stage == "Flowering":
            return PredictBloomResponse(
                model01_result=model01_res,
                current_stage="Flowering",
                is_flowering=True,
                flowering_message="Your Dendrobium orchid is currently flowering.",
                timeline=[],
                total_days_to_flowering=0.0,
                display_total_days=0,
                current_date=current_date_str,
                estimated_flowering_date=current_date_str,
                min_flowering_date=current_date_str,
                max_flowering_date=current_date_str,
                flowering_date_range_display=f"{current_date_str} (Flowering)"
            )

        # Prepare base sensor input if none provided
        if sensor_input is None:
            m, doy = get_date_features(current_date_dt)
            sensor_input = Model02SensorInput(
                current_stage=initial_stage,
                month=m,
                day_of_year=doy
            )

        # Step 2: Iterate through remaining stages to Flowering
        timeline: List[TimelineStep] = []
        accumulated_days = 0.0
        curr_stage = initial_stage
        curr_step_date_dt = current_date_dt

        while curr_stage != "Flowering":
            next_stage = NEXT_STAGE_MAP.get(curr_stage)
            if not next_stage:
                break

            # Set current_stage in sensor_input for this transition
            step_sensor_input = sensor_input.model_copy()
            step_sensor_input.current_stage = curr_stage

            # Predict duration for current -> next stage
            trans_res = self.model02_svc.predict_transition(step_sensor_input)
            step_days = trans_res.predicted_transition_days

            # Date calculation with +- 5 days range
            next_step_date_dt = add_days_to_date(curr_step_date_dt, step_days)
            min_date_dt = add_days_to_date(next_step_date_dt, -5)
            max_date_dt = add_days_to_date(next_step_date_dt, +5)

            min_date_str = format_date_display(min_date_dt)
            max_date_str = format_date_display(max_date_dt)

            step_record = TimelineStep(
                from_stage=curr_stage,
                to_stage=next_stage,
                predicted_days=step_days,
                display_days=round(step_days),
                step_start_date=format_date_display(curr_step_date_dt),
                estimated_stage_date=format_date_display(next_step_date_dt),
                min_range_date=min_date_str,
                max_range_date=max_date_str,
                date_range_display=f"{min_date_str} - {max_date_str}"
            )
            timeline.append(step_record)

            accumulated_days += step_days
            curr_stage = next_stage
            curr_step_date_dt = next_step_date_dt

        # Calculate final estimated flowering date with +- 5 days range
        final_flowering_dt = add_days_to_date(current_date_dt, accumulated_days)
        min_flowering_dt = add_days_to_date(final_flowering_dt, -5)
        max_flowering_dt = add_days_to_date(final_flowering_dt, +5)

        estimated_flowering_date_str = format_date_display(final_flowering_dt)
        min_flowering_str = format_date_display(min_flowering_dt)
        max_flowering_str = format_date_display(max_flowering_dt)
        flowering_range_display_str = f"{min_flowering_str} - {max_flowering_str}"

        return PredictBloomResponse(
            model01_result=model01_res,
            current_stage=initial_stage,
            is_flowering=False,
            flowering_message=None,
            timeline=timeline,
            total_days_to_flowering=accumulated_days,
            display_total_days=round(accumulated_days),
            current_date=current_date_str,
            estimated_flowering_date=estimated_flowering_date_str,
            min_flowering_date=min_flowering_str,
            max_flowering_date=max_flowering_str,
            flowering_date_range_display=flowering_range_display_str
        )

# Global service instance
_bloom_svc_instance: Optional[BloomPredictionService] = None

def get_bloom_prediction_service() -> BloomPredictionService:
    global _bloom_svc_instance
    if _bloom_svc_instance is None:
        _bloom_svc_instance = BloomPredictionService()
    return _bloom_svc_instance
