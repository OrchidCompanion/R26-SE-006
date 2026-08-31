import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.disease import (
    NPK_WINDOW_DAYS,
    _analyze_npk_window,
    _is_all_zero,
    _merge_npk_rows,
    _row_to_npk,
)
from tests.disease_detection.conftest import npk_row, seven_day_rows


class TestNpkWindowUnit:
    """UNIT TESTS: 7-day NPK window mean, deficiency, and merge behaviour."""

    def test_row_to_npk_reads_sensor_columns(self):
        packed = _row_to_npk(npk_row(nitrogen=38, phosphorus=134, potassium=128))
        assert packed["N"] == 38
        assert packed["P"] == 134
        assert packed["K"] == 128

    def test_all_zero_rows_are_skipped(self):
        assert _is_all_zero({"N": 0, "P": 0, "K": 0}) is True
        assert _is_all_zero({"N": 40, "P": 0, "K": 0}) is False

    def test_seven_in_range_days_are_sufficient(self):
        window = _analyze_npk_window(seven_day_rows())
        assert window["days"] == NPK_WINDOW_DAYS
        assert window["days_covered"] == 7
        assert window["sufficient"] is True
        assert window["has_deficiency"] is False
        assert window["mean_status"] == {"N": "ok", "P": "ok", "K": "ok"}
        assert window["prompt"] is None

    def test_high_phosphorus_is_excess_not_deficiency(self):
        rows = seven_day_rows(phosphorus=140)
        window = _analyze_npk_window(rows)
        assert window["has_deficiency"] is False
        assert window["excess_nutrients"] == ["Phosphorus"]
        assert window["mean_status"]["P"] == "high"
        assert "Phosphorus high" in window["deficiency_msg"]

    def test_low_nitrogen_is_deficiency(self):
        rows = seven_day_rows(nitrogen=10)
        window = _analyze_npk_window(rows)
        assert window["has_deficiency"] is True
        assert window["deficient_nutrients"] == ["Nitrogen"]
        assert "Nitrogen low" in window["deficiency_msg"]

    def test_fewer_than_seven_days_is_insufficient(self):
        rows = [npk_row(reading_id="r0", days_ago=0), npk_row(reading_id="r1", days_ago=1)]
        window = _analyze_npk_window(rows)
        assert window["sufficient"] is False
        assert window["days_covered"] == 2
        assert "2 day(s) with data" in window["prompt"]

    def test_all_zero_rows_skipped_from_mean(self):
        rows = seven_day_rows() + [
            npk_row(reading_id="zero", nitrogen=0, phosphorus=0, potassium=0, days_ago=0)
        ]
        window = _analyze_npk_window(rows)
        assert window["skipped_all_zero"] == 1
        assert window["used"] == 7
        assert window["mean"]["N"] == 40

    def test_merge_dedupes_by_reading_id(self):
        a = npk_row(reading_id="same", nitrogen=10)
        b = npk_row(reading_id="same", nitrogen=99)
        merged = _merge_npk_rows([a], [b])
        assert len(merged) == 1
        assert merged[0]["nitrogen_n"] == 10
