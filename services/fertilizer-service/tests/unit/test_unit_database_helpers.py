import pytest
from unittest.mock import patch, MagicMock
from database import (
    _classify_npk_val,
    _analyze_npk_pack,
    get_latest_npk_reading,
    NPK_THRESHOLDS,
    ADVICE_MAP,
)


def test_classify_npk_val_nitrogen():
    low = NPK_THRESHOLDS["N"]["low"]
    high = NPK_THRESHOLDS["N"]["high"]

    assert _classify_npk_val(low - 1, "N") == "low"
    assert _classify_npk_val((low + high) / 2, "N") == "ok"
    assert _classify_npk_val(high + 1, "N") == "high"


def test_classify_npk_val_phosphorus():
    low = NPK_THRESHOLDS["P"]["low"]
    high = NPK_THRESHOLDS["P"]["high"]

    assert _classify_npk_val(low - 1, "P") == "low"
    assert _classify_npk_val((low + high) / 2, "P") == "ok"
    assert _classify_npk_val(high + 1, "P") == "high"


def test_classify_npk_val_potassium():
    low = NPK_THRESHOLDS["K"]["low"]
    high = NPK_THRESHOLDS["K"]["high"]

    assert _classify_npk_val(low - 1, "K") == "low"
    assert _classify_npk_val((low + high) / 2, "K") == "ok"
    assert _classify_npk_val(high + 1, "K") == "high"


def test_classify_npk_val_non_numeric_and_none():
    assert _classify_npk_val(None, "N") == "unknown"
    assert _classify_npk_val("invalid", "N") == "unknown"
    assert _classify_npk_val([], "P") == "unknown"


def test_analyze_npk_pack():
    npk_sample = {
        "N": NPK_THRESHOLDS["N"]["low"] - 10,
        "P": (NPK_THRESHOLDS["P"]["low"] + NPK_THRESHOLDS["P"]["high"]) / 2,
        "K": NPK_THRESHOLDS["K"]["high"] + 10,
    }
    status_dict, advice_list = _analyze_npk_pack(npk_sample)

    assert status_dict["N"] == "low"
    assert status_dict["P"] == "ok"
    assert status_dict["K"] == "high"
    assert len(advice_list) == 3
    assert ADVICE_MAP["N_low"] in advice_list
    assert ADVICE_MAP["P_ok"] in advice_list
    assert ADVICE_MAP["K_high"] in advice_list


def test_get_latest_npk_reading_fallback_when_db_offline():
    """Verify safe fallback data is returned when database connection fails."""
    with patch("database.get_db") as mock_get_db:
        # Simulate connection failure (None returned as connection)
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = None
        mock_ctx.__exit__.return_value = False
        mock_get_db.return_value = mock_ctx

        reading = get_latest_npk_reading(plant_id="test_plant", user_id="test_user")

        assert isinstance(reading, dict)
        assert "nitrogen" in reading
        assert "phosphorous" in reading
        assert "potassium" in reading
        assert reading["nitrogen"] > 0
