import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.disease import NPK_THRESHOLDS, _analyze_npk, _classify_npk_value


class TestNpkClassifyUnit:
    """UNIT TESTS: NPK low/ok/high thresholds used by disease analysis."""

    def test_threshold_config(self):
        assert NPK_THRESHOLDS["N"] == {"low": 25, "high": 65}
        assert NPK_THRESHOLDS["P"] == {"low": 15, "high": 35}
        assert NPK_THRESHOLDS["K"] == {"low": 50, "high": 130}

    @pytest.mark.parametrize(
        "nutrient,value,expected",
        [
            ("N", 24.99, "low"),
            ("N", 25, "ok"),
            ("N", 65, "ok"),
            ("N", 65.01, "high"),
            ("P", 14.99, "low"),
            ("P", 15, "ok"),
            ("P", 35, "ok"),
            ("P", 35.01, "high"),
            ("K", 49.99, "low"),
            ("K", 50, "ok"),
            ("K", 130, "ok"),
            ("K", 130.01, "high"),
        ],
    )
    def test_boundary_values(self, nutrient, value, expected):
        assert _classify_npk_value(value, nutrient) == expected

    def test_none_and_invalid_are_unknown(self):
        assert _classify_npk_value(None, "N") == "unknown"
        assert _classify_npk_value("abc", "P") == "unknown"

    def test_string_numbers_are_coerced(self):
        assert _classify_npk_value("40", "N") == "ok"

    def test_analyze_npk_status_and_advice(self):
        status, advice = _analyze_npk({"N": 10, "P": 140, "K": 80})
        assert status == {"N": "low", "P": "high", "K": "ok"}
        assert "Apply nitrogen-rich fertilizer" in advice
        assert "Reduce phosphorus application" in advice
        assert "Potassium OK" in advice
