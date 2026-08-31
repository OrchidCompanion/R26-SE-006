import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.disease import _in_last_days, _parse_created_at


class TestParseCreatedAtUnit:
    """UNIT TESTS: created_at parsing, including short fractional seconds on Python 3.10."""

    def test_none_and_empty(self):
        assert _parse_created_at(None) is None
        assert _parse_created_at("") is None
        assert _parse_created_at("   ") is None

    def test_datetime_passthrough(self):
        now = datetime(2026, 8, 25, 19, 0, tzinfo=timezone.utc)
        assert _parse_created_at(now) is now

    def test_iso_with_z(self):
        parsed = _parse_created_at("2026-08-25T19:00:00Z")
        assert parsed is not None
        assert parsed.year == 2026
        assert parsed.hour == 19

    def test_short_fractional_seconds_padded(self):
        parsed = _parse_created_at("2026-08-25T19:00:00.17949+00:00")
        assert parsed is not None
        assert parsed.microsecond == 179490

    def test_space_separated_timestamp(self):
        parsed = _parse_created_at("2026-08-25 19:00:00")
        assert parsed is not None
        assert parsed.day == 25

    def test_invalid_string(self):
        assert _parse_created_at("not-a-date") is None

    def test_recent_row_is_in_last_seven_days(self):
        now = datetime.now(timezone.utc).isoformat()
        assert _in_last_days(now) is True

    def test_old_row_is_excluded(self):
        assert _in_last_days("2020-01-01T00:00:00+00:00") is False
