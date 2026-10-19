from main import DISEASE_CONFIDENCE_THRESHOLD, RECOMMENDATIONS, _decide_verdict


def test_threshold_is_point_six():
    assert DISEASE_CONFIDENCE_THRESHOLD == 0.6


def test_healthy_and_invalid_are_never_disease():
    assert _decide_verdict("healthy", 0.99) == "HEALTHY"
    assert _decide_verdict("invalid", 0.99) == "HEALTHY"


def test_disease_when_confidence_meets_threshold():
    assert _decide_verdict("black_rot", 0.6) == "DISEASE"
    assert _decide_verdict("black_rot", 0.81) == "DISEASE"
    assert _decide_verdict("bacterial_brown_spot", 0.7) == "DISEASE"


def test_disease_below_threshold_treated_healthy():
    assert _decide_verdict("black_rot", 0.59) == "HEALTHY"
    assert _decide_verdict("bacterial_brown_spot", 0.0) == "HEALTHY"


def test_recommendation_keys_cover_all_classes():
    assert set(RECOMMENDATIONS) == {
        "black_rot",
        "bacterial_brown_spot",
        "healthy",
        "invalid",
    }
    for rec in RECOMMENDATIONS.values():
        assert rec["label"]
        assert rec["treatment"]
