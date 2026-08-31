import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.bloom import evaluate_environmental_conditions


class TestBloomEnvironmentalEvaluationUnit:
    """UNIT TESTS: Testing evaluate_environmental_conditions isolated logic across all microclimates."""

    def test_optimal_conditions(self):
        """All 3 factors (27°C, 72% RH, 20,000 Lux) in optimal range."""
        res = evaluate_environmental_conditions(27.0, 72.0, 20000.0)
        assert res["temperature_status"] == "Optimal"
        assert res["humidity_status"] == "Optimal"
        assert res["light_status"] == "Optimal"
        assert "recommended range" in res["recommendation"]

    @pytest.mark.parametrize(
        "t,h,l",
        [
            (25.0, 70.0, 16000.0),
            (30.0, 75.0, 32000.0),
            (27.5, 72.5, 24000.0),
        ],
    )
    def test_boundary_optimal_thresholds(self, t, h, l):
        """Test exact boundary values for optimal conditions."""
        res = evaluate_environmental_conditions(t, h, l)
        assert res["temperature_status"] == "Optimal"
        assert res["humidity_status"] == "Optimal"
        assert res["light_status"] == "Optimal"

    @pytest.mark.parametrize(
        "t,expected_stat,keyword",
        [
            (21.0, "Low", "warmer, sheltered location"),
            (34.0, "High", "cooler, naturally shaded location"),
        ],
    )
    def test_single_factor_temperature(self, t, expected_stat, keyword):
        res = evaluate_environmental_conditions(avg_temp=t, avg_humidity=72.0, avg_light=20000.0)
        assert res["temperature_status"] == expected_stat
        assert res["humidity_status"] == "Optimal"
        assert res["light_status"] == "Optimal"
        assert keyword in res["recommendation"]

    @pytest.mark.parametrize(
        "h,expected_stat,keyword",
        [
            (55.0, "Low", "water-and-pebble tray"),
            (88.0, "High", "air circulation"),
        ],
    )
    def test_single_factor_humidity(self, h, expected_stat, keyword):
        res = evaluate_environmental_conditions(avg_temp=27.0, avg_humidity=h, avg_light=20000.0)
        assert res["temperature_status"] == "Optimal"
        assert res["humidity_status"] == expected_stat
        assert res["light_status"] == "Optimal"
        assert keyword in res["recommendation"]

    @pytest.mark.parametrize(
        "l,expected_stat,keyword",
        [
            (8000.0, "Low", "brighter location with gentle morning sunlight"),
            (45000.0, "High", "natural shade or a light curtain"),
        ],
    )
    def test_single_factor_light(self, l, expected_stat, keyword):
        res = evaluate_environmental_conditions(avg_temp=27.0, avg_humidity=72.0, avg_light=l)
        assert res["temperature_status"] == "Optimal"
        assert res["humidity_status"] == "Optimal"
        assert res["light_status"] == expected_stat
        assert keyword in res["recommendation"]

    @pytest.mark.parametrize(
        "t,h,l,expected_t,expected_h,expected_l",
        [
            (20.0, 50.0, 10000.0, "Low", "Low", "Low"),
            (20.0, 50.0, 45000.0, "Low", "Low", "High"),
            (20.0, 85.0, 10000.0, "Low", "High", "Low"),
            (20.0, 85.0, 45000.0, "Low", "High", "High"),
            (35.0, 50.0, 10000.0, "High", "Low", "Low"),
            (35.0, 50.0, 45000.0, "High", "Low", "High"),
            (35.0, 85.0, 10000.0, "High", "High", "Low"),
            (35.0, 85.0, 45000.0, "High", "High", "High"),
        ],
    )
    def test_three_factors_abnormal(self, t, h, l, expected_t, expected_h, expected_l):
        res = evaluate_environmental_conditions(t, h, l)
        assert res["temperature_status"] == expected_t
        assert res["humidity_status"] == expected_h
        assert res["light_status"] == expected_l
        assert isinstance(res["recommendation"], str)
        assert len(res["recommendation"]) > 20

    def test_defensive_types(self):
        res = evaluate_environmental_conditions(None, "72.0", "20000")
        assert res["temperature_status"] == "Optimal"
        assert res["humidity_status"] == "Optimal"
        assert res["light_status"] == "Optimal"
