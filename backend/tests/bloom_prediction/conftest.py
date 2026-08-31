import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent
ML_DIR = ROOT_DIR / "ml-service"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from main import app
from utils.auth import get_current_user

USER_ID = "11111111-1111-1111-1111-111111111111"
PLANT_ID = "22222222-2222-2222-2222-222222222222"


def chain_supabase(data=None, count=None):
    """Return a supabase mock whose query methods all chain to execute()."""
    mock = MagicMock()
    mock_res = MagicMock()
    mock_res.data = data if data is not None else []
    mock_res.count = count if count is not None else (len(data) if data is not None else 0)

    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "is_",
        "order",
        "range",
        "limit",
        "gte",
        "lte",
    ):
        getattr(mock.table.return_value, method).return_value = mock.table.return_value

    mock.table.return_value.execute.return_value = mock_res
    return mock


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": USER_ID,
        "email": "tester@example.com",
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
