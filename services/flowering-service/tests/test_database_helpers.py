from unittest.mock import MagicMock, patch
import pytest

from database import (
    get_db,
    save_prediction_history,
    get_plant_prediction_history,
    get_user_prediction_history,
    soft_delete_prediction_history,
    save_sensor_reading,
    get_sensor_statistics,
)


def test_get_db_offline_yields_none():
    """Verify get_db context manager yields None when database pool is None."""
    with patch("database.get_pool", return_value=None):
        with get_db() as conn:
            assert conn is None


def test_get_db_active_pool_lifecycle():
    """Verify connection is acquired and returned to pool in finally block."""
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn

    with patch("database.get_pool", return_value=mock_pool):
        with get_db() as conn:
            assert conn == mock_conn

        mock_pool.putconn.assert_called_once_with(mock_conn)


def test_save_prediction_history_db_offline():
    """Verify returns None when database is not connected."""
    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = None
        mock_get_db.return_value = mock_ctx

        res = save_prediction_history({"plant_id": "p-1"})
        assert res is None


def test_save_prediction_history_success():
    """Verify successful insert query and record retrieval."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = {"id": "rec-123", "plant_id": "p-1", "current_stage": "Vegetative"}
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.Json", side_effect=lambda x: x):
        with patch("database.get_db") as mock_get_db:
            mock_ctx = MagicMock()
            mock_ctx.__enter__.return_value = mock_conn
            mock_get_db.return_value = mock_ctx

            payload = {
                "plant_id": "p-1",
                "user_id": "u-1",
                "current_stage": "Vegetative",
                "total_days_to_flowering": 30.0,
                "timeline": [{"step": 1}],
                "sensor_summary": {"avg_temp": 27.0},
                "environment_evaluation": {"status": "Optimal"},
            }
            res = save_prediction_history(payload)

            assert res["id"] == "rec-123"
            assert res["plant_id"] == "p-1"
            assert mock_cur.execute.called
            assert mock_conn.commit.called


def test_save_prediction_history_exception_rollback():
    """Verify rollback on sql error and graceful return of None."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.execute.side_effect = Exception("DB Disk Full")
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        res = save_prediction_history({"plant_id": "p-1"})
        assert res is None
        assert mock_conn.rollback.called


def test_get_plant_prediction_history_empty_plant_id():
    """Verify empty plant_id returns zero results immediately."""
    res = get_plant_prediction_history("", page=1, limit=10)
    assert res == {"data": [], "total": 0, "page": 1, "limit": 10}


def test_get_plant_prediction_history_db_offline():
    """Verify offline db returns empty structure gracefully."""
    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = None
        mock_get_db.return_value = mock_ctx

        res = get_plant_prediction_history("p-01", page=2, limit=5)
        assert res == {"data": [], "total": 0, "page": 2, "limit": 5}


def test_get_plant_prediction_history_success():
    """Verify paginated fetch and offset calculation."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = {"total": 15}
    mock_cur.fetchall.return_value = [{"id": "r-1"}, {"id": "r-2"}]
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        res = get_plant_prediction_history("plant-99", page=2, limit=5)
        assert res["total"] == 15
        assert len(res["data"]) == 2
        assert res["page"] == 2
        assert res["limit"] == 5

        # Check offset = (page - 1) * limit = (2 - 1) * 5 = 5
        executed_args = mock_cur.execute.call_args_list[1][0][1]
        assert executed_args == ("plant-99", 5, 5)


def test_get_plant_prediction_history_db_error():
    """Verify error during fetch handled gracefully."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.execute.side_effect = Exception("Query timeout")
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        res = get_plant_prediction_history("plant-99")
        assert res["data"] == []
        assert res["total"] == 0


def test_get_user_prediction_history_empty_user_id():
    """Verify empty user_id returns empty list."""
    assert get_user_prediction_history("") == []


def test_get_user_prediction_history_db_offline():
    """Verify offline db returns empty list."""
    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = None
        mock_get_db.return_value = mock_ctx

        assert get_user_prediction_history("usr-1") == []


def test_get_user_prediction_history_success():
    """Verify records returned for valid user."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [{"id": "rec-1"}, {"id": "rec-2"}]
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        rows = get_user_prediction_history("usr-1", limit=10)
        assert len(rows) == 2
        assert rows[0]["id"] == "rec-1"


def test_soft_delete_prediction_history_db_offline():
    """Verify offline db returns False on soft delete."""
    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = None
        mock_get_db.return_value = mock_ctx

        assert soft_delete_prediction_history("rec-1") is False


def test_soft_delete_prediction_history_outcomes():
    """Verify True when row is found/deleted, False when record not found."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        # When rowcount is 1 (found and updated)
        mock_cur.rowcount = 1
        assert soft_delete_prediction_history("rec-1") is True
        assert mock_conn.commit.called

        # When rowcount is 0 (not found)
        mock_cur.rowcount = 0
        assert soft_delete_prediction_history("missing-rec") is False


def test_soft_delete_prediction_history_exception_rollback():
    """Verify rollback on exception during soft delete."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.execute.side_effect = Exception("Deadlock detected")
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("database.get_db") as mock_get_db:
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_ctx

        assert soft_delete_prediction_history("rec-1") is False
        assert mock_conn.rollback.called


def test_save_sensor_reading_success():
    """Verify forwarding sensor readings to placement-service via HTTP POST."""
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "ok", "reading_id": "sensor-101"}
    mock_client.post.return_value = mock_resp

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        res = save_sensor_reading(
            temperature=28.0,
            humidity=74.0,
            light=23000.0,
            plant_id="p-01",
            module_id="mod-1",
            user_id="u-1",
        )

        assert res["reading_id"] == "sensor-101"
        assert mock_client.post.call_count == 2


def test_save_sensor_reading_http_error_handled_gracefully():
    """Verify network exception returns None safely."""
    with patch("httpx.Client") as mock_httpx:
        mock_client = MagicMock()
        mock_client.post.side_effect = Exception("Placement service unreachable")
        mock_httpx.return_value.__enter__.return_value = mock_client

        res = save_sensor_reading(temperature=28.0, humidity=74.0, light=23000.0)
        assert res is None


def test_get_sensor_statistics_success():
    """Verify valid sensor telemetry data is returned."""
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "avg_temp_c": 27.1,
        "avg_humidity_rh": 72.0,
        "avg_light_lux": 19500.0,
        "telemetry_samples_count": 80,
        "is_default_baseline": False,
    }
    mock_client.get.return_value = mock_resp

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        stats = get_sensor_statistics(plant_id="plant-42", user_id="usr-1", days=30)
        assert stats is not None
        assert stats["avg_temp_c"] == 27.1
        assert stats["telemetry_samples_count"] == 80


def test_get_sensor_statistics_returns_none_when_baseline_or_zero_samples():
    """Verify fallback baseline or zero sample counts return None so API can alert user."""
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        # Case 1: is_default_baseline is True
        mock_resp.json.return_value = {"is_default_baseline": True, "telemetry_samples_count": 50}
        assert get_sensor_statistics(plant_id="plant-42") is None

        # Case 2: telemetry_samples_count is 0
        mock_resp.json.return_value = {"is_default_baseline": False, "telemetry_samples_count": 0}
        assert get_sensor_statistics(plant_id="plant-42") is None


def test_get_sensor_statistics_network_error():
    """Verify network failure returns None safely."""
    with patch("httpx.Client") as mock_httpx:
        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("Connection refused")
        mock_httpx.return_value.__enter__.return_value = mock_client

        assert get_sensor_statistics(plant_id="plant-42") is None
