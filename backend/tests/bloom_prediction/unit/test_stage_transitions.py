import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.bloom import BLOOMING_STAGES, NEXT_STAGE_MAP, STAGE_CLASS_MAP


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
