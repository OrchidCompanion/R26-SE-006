import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.disease import DISEASE_CONFIDENCE_THRESHOLD, RECOMMENDATIONS, _decide_verdict


class TestDiseaseVerdictUnit:
    """UNIT TESTS: disease vs healthy verdict from predicted class + confidence."""

    def test_threshold_is_sixty_percent(self):
        assert DISEASE_CONFIDENCE_THRESHOLD == 0.6

    @pytest.mark.parametrize(
        "predicted_class,confidence,expected",
        [
            ("black_rot", 0.90, "DISEASE"),
            ("bacterial_brown_spot", 0.60, "DISEASE"),
            ("black_rot", 0.59, "HEALTHY"),
            ("healthy", 0.99, "HEALTHY"),
            ("invalid", 0.95, "HEALTHY"),
        ],
    )
    def test_decide_verdict(self, predicted_class, confidence, expected):
        assert _decide_verdict(predicted_class, confidence) == expected

    def test_recommendation_copy_exists_for_all_classes(self):
        for key in ("black_rot", "bacterial_brown_spot", "healthy", "invalid"):
            rec = RECOMMENDATIONS[key]
            assert rec["label"]
            assert rec["disease_info"]
            assert rec["treatment"]
