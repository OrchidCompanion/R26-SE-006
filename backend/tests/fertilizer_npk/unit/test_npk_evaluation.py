import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.npk_recomendation import (
    evaluate_npk,
    _get_nutrient_status,
    TARGET_RATIOS,
    RATIO_TOLERANCE_PCT,
)


class TestNPKEvaluationUnit:
    """UNIT TESTS: Testing evaluate_npk recommendation engine in isolation."""

    def test_target_ratios_configuration(self):
        """Verify target ratios exist for all 3 Dendrobium orchid growth stages."""
        assert "Vegetative" in TARGET_RATIOS
        assert "Pre Flowering" in TARGET_RATIOS
        assert "Matured" in TARGET_RATIOS
        assert TARGET_RATIOS["Vegetative"]["ratio_str"] == "30-10-10"
        assert TARGET_RATIOS["Pre Flowering"]["ratio_str"] == "20-20-20"
        assert TARGET_RATIOS["Matured"]["ratio_str"] == "6-30-30"

    def test_vegetative_stage_optimal_balance(self):
        """Test Vegetative stage (30-10-10) with exact 60:20:20 relative balance."""
        res = evaluate_npk("Vegetative", nitrogen=60.0, phosphorous=20.0, potassium=20.0)
        assert res["growth_stage"] == "Vegetative"
        assert res["target_ratio"] == "30-10-10"
        assert res["status"]["nitrogen"] == "optimal"
        assert res["status"]["phosphorous"] == "optimal"
        assert res["status"]["potassium"] == "optimal"
        assert "within the target range" in res["recommendation"][0]

    def test_vegetative_stage_deficient_nitrogen(self):
        """Test Vegetative stage when nitrogen relative percentage is low."""
        # Sensor total: 100 mg/kg -> N: 20%, P: 40%, K: 40% (Target N is 60%)
        res = evaluate_npk("Vegetative", nitrogen=20.0, phosphorous=40.0, potassium=40.0)
        assert res["status"]["nitrogen"] == "deficient"
        assert any("Nitrogen is relatively deficient" in r for r in res["recommendation"])

    def test_pre_flowering_stage_optimal(self):
        """Test Pre Flowering stage (20-20-20 / 33.3% each) with balanced inputs."""
        res = evaluate_npk("Pre Flowering", nitrogen=30.0, phosphorous=30.0, potassium=30.0)
        assert res["target_ratio"] == "20-20-20"
        assert res["status"]["nitrogen"] == "optimal"
        assert res["status"]["phosphorous"] == "optimal"
        assert res["status"]["potassium"] == "optimal"

    def test_pre_flowering_stage_excess_nitrogen(self):
        """Test Pre Flowering stage when nitrogen is in excess."""
        # N=70, P=15, K=15 -> N is 70% (target 33.33%)
        res = evaluate_npk("Pre Flowering", nitrogen=70.0, phosphorous=15.0, potassium=15.0)
        assert res["status"]["nitrogen"] == "excess"
        assert any("excessive" in r for r in res["recommendation"])

    def test_matured_stage_optimal(self):
        """Test Matured stage (6-30-30 / N=9.09%, P=45.45%, K=45.45%)."""
        # Sensor: N=9.1, P=45.5, K=45.5 -> total=100.1
        res = evaluate_npk("Matured", nitrogen=9.1, phosphorous=45.5, potassium=45.5)
        assert res["target_ratio"] == "6-30-30"
        assert res["status"]["nitrogen"] == "optimal"
        assert res["status"]["phosphorous"] == "optimal"
        assert res["status"]["potassium"] == "optimal"

    def test_zero_sensor_readings(self):
        """Test handling of 0 sensor readings across all nutrients."""
        res = evaluate_npk("Vegetative", nitrogen=0.0, phosphorous=0.0, potassium=0.0)
        assert res["status"]["nitrogen"] == "deficient"
        assert res["status"]["phosphorous"] == "deficient"
        assert res["status"]["potassium"] == "deficient"
        assert "No NPK sensor reading was detected" in res["recommendation"][0]

    def test_invalid_growth_stage_raises_error(self):
        """Test that invalid growth stage raises ValueError."""
        with pytest.raises(ValueError) as excinfo:
            evaluate_npk("Seedling", nitrogen=10.0, phosphorous=10.0, potassium=10.0)
        assert "Unknown growth stage" in str(excinfo.value)

    def test_type_coercion_from_string_inputs(self):
        """Test string numeric input casting for robustness."""
        res = evaluate_npk("Vegetative", nitrogen="60.0", phosphorous="20.0", potassium="20.0")
        assert res["readings"]["nitrogen"] == 60.0
        assert res["status"]["nitrogen"] == "optimal"

    @pytest.mark.parametrize(
        "current_pct,target_pct,expected",
        [
            (50.0, 60.0, "deficient"),  # 50 < 60 - 5 (55) -> deficient
            (56.0, 60.0, "optimal"),    # 56 is in [55, 65] -> optimal
            (60.0, 60.0, "optimal"),    # 60 is in [55, 65] -> optimal
            (64.0, 60.0, "optimal"),    # 64 is in [55, 65] -> optimal
            (66.0, 60.0, "excess"),     # 66 > 60 + 5 (65) -> excess
        ],
    )
    def test_nutrient_status_boundary_tolerance(self, current_pct, target_pct, expected):
        """Verify _get_nutrient_status boundary calculation with 5% tolerance."""
        assert _get_nutrient_status(current_pct, target_pct) == expected
