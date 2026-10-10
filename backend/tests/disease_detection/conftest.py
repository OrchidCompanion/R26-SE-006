import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from utils.auth import get_current_user

USER_ID = "11111111-1111-1111-1111-111111111111"
PLANT_ID = "22222222-2222-2222-2222-222222222222"
OWNER_ID = "7e63e824-d7c7-4390-9bc4-7a8fb24e7753"


def iso_days_ago(days: int, hour: int = 7) -> str:
    ts = datetime.now(timezone.utc) - timedelta(days=days)
    return ts.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def npk_row(
    reading_id="r1",
    nitrogen=40,
    phosphorus=20,
    potassium=80,
    days_ago=0,
    time_slot="morning",
    plant_id=PLANT_ID,
):
    return {
        "reading_id": reading_id,
        "plant_id": plant_id,
        "nitrogen_n": nitrogen,
        "phosphorus_p": phosphorus,
        "potassium_k": potassium,
        "time_slot": time_slot,
        "created_at": iso_days_ago(days_ago),
    }


def seven_day_rows(**overrides):
    return [
        npk_row(reading_id=f"r{i}", days_ago=i, **overrides)
        for i in range(7)
    ]


def chain_supabase(table_data=None, count=None):
    """Return a supabase mock whose query methods all chain to execute()."""
    table_data = table_data or {}

    def table(name):
        mock = MagicMock()
        result = MagicMock()
        payload = table_data.get(name, [])
        result.data = payload
        result.count = count if count is not None else len(payload or [])
        for method in (
            "select",
            "gte",
            "eq",
            "order",
            "limit",
            "range",
            "is_",
            "insert",
            "update",
        ):
            getattr(mock, method).return_value = mock
        mock.execute.return_value = result
        return mock

    sb = MagicMock()
    sb.table.side_effect = table
    return sb


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": USER_ID,
        "email": "tester@example.com",
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
