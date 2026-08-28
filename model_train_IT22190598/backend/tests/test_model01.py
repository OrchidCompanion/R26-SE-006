import pytest
import os
import sys

# Ensure backend package path is available
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.config import STAGE_CLASS_MAP, BLOOMING_STAGES
from app.services.model01_service import get_model01_service

def test_model01_loading():
    """Verify Model 01 loads successfully and names map correctly."""
    svc = get_model01_service()
    assert svc.model is not None, "Model 01 instance should not be None"
    assert hasattr(svc, "class_names") and len(svc.class_names) == 5, "Model should have 5 class names"

def test_stage_mapping():
    """Verify class 2 is mapped to Mature_Pseudobulb."""
    assert STAGE_CLASS_MAP[2] == "Mature_Pseudobulb"
    assert "Mature_Pseudobulb" in BLOOMING_STAGES

def test_validation_logic():
    """Verify image file validation logic."""
    svc = get_model01_service()
    err_type = svc.validate_file("invalid_file.txt", b"dummy")
    assert err_type is not None
    assert "Invalid file type" in err_type

    err_size = svc.validate_file("test.jpg", b"x" * (11 * 1024 * 1024))
    assert err_size is not None
    assert "exceeds limit" in err_size
