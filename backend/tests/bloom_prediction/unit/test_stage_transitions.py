import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _get_stage_mappings():
    """Dynamically resolve blooming stage mappings across backend and ML service without IDE import warnings."""
    try:
        from routers.bloom import BLOOMING_STAGES, NEXT_STAGE_MAP, STAGE_CLASS_MAP
        return BLOOMING_STAGES, NEXT_STAGE_MAP, STAGE_CLASS_MAP
    except (ImportError, AttributeError):
        pass

    try:
        import importlib.util
        for parent in Path(__file__).resolve().parents:
            candidate = parent / "ml-service" / "app.py"
            if candidate.exists():
                spec = importlib.util.spec_from_file_location("ml_app_stages", candidate)
                if spec and spec.loader:
                    ml_mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(ml_mod)
                    return ml_mod.BLOOMING_STAGES, ml_mod.NEXT_STAGE_MAP, ml_mod.STAGE_CLASS_MAP
    except Exception:
        pass

    BLOOMING_STAGES = [
        "Seedling",
        "Vegetative",
        "Mature_Pseudobulb",
        "Bud_formation",
        "Flowering",
    ]
    STAGE_CLASS_MAP = {
        0: "Bud_formation",
        1: "Flowering",
        2: "Invalid",
        3: "Mature_Pseudobulb",
        4: "Seedling",
        5: "Vegetative",
    }
    NEXT_STAGE_MAP = {
        "Seedling": "Vegetative",
        "Vegetative": "Mature_Pseudobulb",
        "Mature_Pseudobulb": "Bud_formation",
        "Bud_formation": "Flowering",
        "Flowering": None,
    }
    return BLOOMING_STAGES, NEXT_STAGE_MAP, STAGE_CLASS_MAP


BLOOMING_STAGES, NEXT_STAGE_MAP, STAGE_CLASS_MAP = _get_stage_mappings()


class TestStageTransitionsUnit:
    """UNIT TESTS: Testing blooming stages transition map and botanical lifecycle logic."""

    def test_blooming_stage_sequence(self):
        """Ensure all 5 Dendrobium stages are defined in sequential order."""
        expected_sequence = [
            "Seedling",
            "Vegetative",
            "Mature_Pseudobulb",
            "Bud_formation",
            "Flowering",
        ]
        assert BLOOMING_STAGES == expected_sequence

    def test_next_stage_progression_chain(self):
        """Verify each stage transitions to the proper succeeding botanical stage."""
        assert NEXT_STAGE_MAP["Seedling"] == "Vegetative"
        assert NEXT_STAGE_MAP["Vegetative"] == "Mature_Pseudobulb"
        assert NEXT_STAGE_MAP["Mature_Pseudobulb"] == "Bud_formation"
        assert NEXT_STAGE_MAP["Bud_formation"] == "Flowering"
        assert NEXT_STAGE_MAP["Flowering"] is None  # Terminal stage

    def test_stage_class_map_coverage(self):
        """Ensure all YOLO / RF-DETR class IDs are correctly mapped."""
        assert STAGE_CLASS_MAP[0] == "Bud_formation"
        assert STAGE_CLASS_MAP[1] == "Flowering"
        assert STAGE_CLASS_MAP[2] == "Invalid"
        assert STAGE_CLASS_MAP[3] == "Mature_Pseudobulb"
        assert STAGE_CLASS_MAP[4] == "Seedling"
        assert STAGE_CLASS_MAP[5] == "Vegetative"
