import pytest
from recommendation_engine import (
    evaluate_npk,
    _get_nutrient_status,
    TARGET_RATIOS,
    STAGE_ALIASES,
    RATIO_TOLERANCE_PCT,
)


def test_target_ratios_exact_three_stages():
    """Verify strictly the 3 defined orchid growth stages exist in TARGET_RATIOS."""
    expected_stages = {"Vegetative", "Pre Flowering", "Matured"}
    assert set(TARGET_RATIOS.keys()) == expected_stages

    for stage in expected_stages:
        data = TARGET_RATIOS[stage]
        assert "ratio_str" in data
        assert "n" in data and "p" in data and "k" in data
        assert "frequency" in data
        assert "notes" in data
        assert data["n"] + data["p"] + data["k"] > 0


def test_stage_ratios_formulations():
    """Verify specific target NPK formulations for the 3 stages."""
    assert TARGET_RATIOS["Vegetative"]["ratio_str"] == "30-10-10"
    assert TARGET_RATIOS["Pre Flowering"]["ratio_str"] == "20-20-20"
    assert TARGET_RATIOS["Matured"]["ratio_str"] == "6-30-30"


def test_get_nutrient_status_boundaries():
    """Test boundary conditions for nutrient status (optimal, deficient, excess)."""
    target = 20.0
    tol = RATIO_TOLERANCE_PCT  # 5.0

    # Within tolerance [15.0, 25.0]
    assert _get_nutrient_status(20.0, target) == "optimal"
    assert _get_nutrient_status(15.0, target) == "optimal"
    assert _get_nutrient_status(25.0, target) == "optimal"

    # Deficient (< 15.0)
    assert _get_nutrient_status(14.9, target) == "deficient"
    assert _get_nutrient_status(0.0, target) == "deficient"

    # Excess (> 25.0)
    assert _get_nutrient_status(25.1, target) == "excess"
    assert _get_nutrient_status(50.0, target) == "excess"


def test_evaluate_npk_vegetative_optimal():
    """Test optimal nutrient balance in Vegetative stage (30-10-10 -> 60%, 20%, 20%)."""
    result = evaluate_npk("Vegetative", nitrogen=60.0, phosphorous=20.0, potassium=20.0)
    assert result["growth_stage"] == "Vegetative"
    assert result["target_ratio"] == "30-10-10"
    assert result["status"]["nitrogen"] == "optimal"
    assert result["status"]["phosphorus"] == "optimal"
    assert result["status"]["potassium"] == "optimal"
    assert "optimal" in result["recommendation"].lower()


def test_evaluate_npk_matured_optimal():
    """Test optimal nutrient balance in Matured stage (6-30-30 -> 9.1%, 45.5%, 45.5%)."""
    result = evaluate_npk("Matured", nitrogen=9.0, phosphorous=45.5, potassium=45.5)
    assert result["growth_stage"] == "Matured"
    assert result["target_ratio"] == "6-30-30"
    assert result["status"]["nitrogen"] == "optimal"
    assert result["status"]["phosphorus"] == "optimal"
    assert result["status"]["potassium"] == "optimal"


def test_evaluate_npk_adjustments_needed():
    """Test adjustments triggered when Nitrogen is deficient and Potassium is in excess."""
    # Low N, High K
    result = evaluate_npk("Vegetative", nitrogen=10.0, phosphorous=20.0, potassium=70.0)
    assert result["status"]["nitrogen"] == "deficient"
    assert result["status"]["potassium"] == "excess"
    assert "Increase Nitrogen proportion" in result["recommendation"]
    assert "Reduce Potassium proportion" in result["recommendation"]


def test_evaluate_npk_zero_division_safety():
    """Test when all sensor readings are zero to verify ZeroDivisionError is avoided."""
    result = evaluate_npk("Matured", nitrogen=0.0, phosphorous=0.0, potassium=0.0)
    assert result["growth_stage"] == "Matured"
    assert result["target_ratio"] == "6-30-30"
    assert "readings" in result
    assert result["readings"]["nitrogen_mg_kg"] == 0.0


def test_evaluate_npk_stage_alias_normalization():
    """Test that alternate formats of stage names map properly to the 3 canonical stages."""
    # preflowering / pre-flowering / pre flowering -> Pre Flowering
    res_pf1 = evaluate_npk("preflowering", nitrogen=20.0, phosphorous=20.0, potassium=20.0)
    assert res_pf1["growth_stage"] == "Pre Flowering"
    assert res_pf1["target_ratio"] == "20-20-20"

    res_pf2 = evaluate_npk("Pre-Flowering", nitrogen=20.0, phosphorous=20.0, potassium=20.0)
    assert res_pf2["growth_stage"] == "Pre Flowering"

    # mature / matured -> Matured
    res_mat = evaluate_npk("mature", nitrogen=6.0, phosphorous=30.0, potassium=30.0)
    assert res_mat["growth_stage"] == "Matured"
    assert res_mat["target_ratio"] == "6-30-30"


def test_evaluate_npk_unknown_stage_fallback():
    """Test unknown growth stage strings fallback cleanly to 'Vegetative'."""
    result = evaluate_npk("NonExistentStage", nitrogen=30.0, phosphorous=10.0, potassium=10.0)
    assert result["growth_stage"] == "Vegetative"
    assert result["target_ratio"] == "30-10-10"


@pytest.mark.parametrize("stage", ["Vegetative", "Pre Flowering", "Matured"])
def test_evaluate_npk_all_valid_stages(stage):
    """Test that the 3 valid stages evaluate with consistent schema."""
    result = evaluate_npk(stage, nitrogen=100.0, phosphorous=100.0, potassium=100.0)
    assert result["growth_stage"] == stage
    assert "target_ratio" in result
    assert "recommended_formulation" in result
    assert "status" in result
    assert "recommendation" in result
