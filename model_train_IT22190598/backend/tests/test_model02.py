import pytest
import os
import sys

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.config import MODEL02_FEATURE_ORDER
from app.schemas.prediction import Model02SensorInput
from app.services.model02_service import get_model02_service

def test_model02_loading():
    """Verify Model 02 pipeline loads successfully."""
    svc = get_model02_service()
    assert svc.pipeline is not None, "Model 02 pipeline should not be None"

def test_feature_order_exactness():
    """Verify the exact 15 feature columns expected by Model 02."""
    assert len(MODEL02_FEATURE_ORDER) == 15
    assert MODEL02_FEATURE_ORDER[0] == "current_stage"
    assert MODEL02_FEATURE_ORDER[-1] == "light_std_lux"

def test_prediction_output():
    """Verify Model 02 generates non-negative transition duration predictions."""
    svc = get_model02_service()
    input_data = Model02SensorInput(
        current_stage="Mature_Pseudobulb",
        month=8,
        day_of_year=231,
        avg_temp_c=27.5,
        min_temp_c=22.0,
        max_temp_c=32.0,
        temp_std_c=3.1,
        avg_humidity_rh=70.0,
        min_humidity_rh=55.0,
        max_humidity_rh=85.0,
        humidity_std_rh=7.5,
        avg_light_lux=14000.0,
        min_light_lux=3000.0,
        max_light_lux=30000.0,
        light_std_lux=7000.0
    )
    res = svc.predict_transition(input_data)
    assert res.current_stage == "Mature_Pseudobulb"
    assert res.next_stage == "Bud_formation"
    assert res.predicted_transition_days > 0
    assert res.display_days == round(res.predicted_transition_days)

def test_flowering_terminal_stage():
    """Verify Flowering stage returns 0 days and terminal message."""
    svc = get_model02_service()
    input_data = Model02SensorInput(current_stage="Flowering")
    res = svc.predict_transition(input_data)
    assert res.current_stage == "Flowering"
    assert res.next_stage is None
    assert res.predicted_transition_days == 0.0
    assert "currently flowering" in res.message
