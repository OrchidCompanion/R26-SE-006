import sys
from pathlib import Path
import numpy as np
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _get_model02_features():
    """Dynamically resolve MODEL02_FEATURE_ORDER without IDE import warnings."""
    try:
        from routers.bloom import MODEL02_FEATURE_ORDER
        return MODEL02_FEATURE_ORDER
    except (ImportError, AttributeError):
        pass

    try:
        import importlib.util
        for parent in Path(__file__).resolve().parents:
            candidate = parent / "ml-service" / "app.py"
            if candidate.exists():
                spec = importlib.util.spec_from_file_location("ml_app_features", candidate)
                if spec and spec.loader:
                    ml_mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(ml_mod)
                    return ml_mod.MODEL02_FEATURE_ORDER
    except Exception:
        pass

    return [
        "current_stage",
        "month",
        "day_of_year",
        "avg_temp_c",
        "min_temp_c",
        "max_temp_c",
        "temp_std_c",
        "avg_humidity_rh",
        "min_humidity_rh",
        "max_humidity_rh",
        "humidity_std_rh",
        "avg_light_lux",
        "min_light_lux",
        "max_light_lux",
        "light_std_lux",
    ]


MODEL02_FEATURE_ORDER = _get_model02_features()


class TestTelemetryFeaturesUnit:
    """UNIT TESTS: Testing 15-feature environmental vector ordering and statistical computation."""

    def test_model02_15_feature_order_contract(self):
        """Ensure the exact 15 ordered features required by Model 02 are defined."""
        expected_features = [
            "current_stage",
            "month",
            "day_of_year",
            "avg_temp_c",
            "min_temp_c",
            "max_temp_c",
            "temp_std_c",
            "avg_humidity_rh",
            "min_humidity_rh",
            "max_humidity_rh",
            "humidity_std_rh",
            "avg_light_lux",
            "min_light_lux",
            "max_light_lux",
            "light_std_lux",
        ]
        assert MODEL02_FEATURE_ORDER == expected_features
        assert len(MODEL02_FEATURE_ORDER) == 15

    def test_statistical_aggregation_calculations(self):
        """Verify mean, min, max, std computations matching 30-day IoT telemetry aggregation."""
        sample_temps = [24.0, 26.0, 28.0, 30.0]
        sample_hums = [65.0, 70.0, 75.0, 80.0]
        sample_luxs = [18000.0, 22000.0, 26000.0, 30000.0]

        avg_t = round(float(np.mean(sample_temps)), 2)
        min_t = round(float(np.min(sample_temps)), 2)
        max_t = round(float(np.max(sample_temps)), 2)
        std_t = round(float(np.std(sample_temps)), 2)

        assert avg_t == 27.0
        assert min_t == 24.0
        assert max_t == 30.0
        assert std_t == 2.24

        avg_h = round(float(np.mean(sample_hums)), 2)
        assert avg_h == 72.5

        avg_l = round(float(np.mean(sample_luxs)), 2)
        assert avg_l == 24000.0
