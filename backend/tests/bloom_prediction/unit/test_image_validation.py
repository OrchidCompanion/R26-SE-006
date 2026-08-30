import sys
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routers.bloom import _validate_orchid_image


class TestOrchidImageValidationUnit:
    """UNIT TESTS: Testing botanical image validation heuristic in isolation."""

    def test_blank_solid_image_rejected(self):
        """Pure white or pure black image must be rejected as non-orchid."""
        blank_img = Image.new("RGB", (200, 200), color=(255, 255, 255))
        is_valid, msg = _validate_orchid_image(blank_img)
        assert is_valid is False
        assert "blank" in msg.lower() or "non-orchid" in msg.lower()

    def test_textured_green_plant_image_accepted(self):
        """Synthetic textured green orchid plant image with foliage should pass botanical validation."""
        # Create an image with natural variation (green leaves on neutral background)
        arr = np.full((200, 200, 3), 120, dtype=np.uint8)  # neutral background
        arr[30:170, 30:170] = [34, 139, 34]  # Forest green plant area
        # Add texture/variation
        rng = np.random.RandomState(42)
        noise = rng.randint(-10, 10, size=(200, 200, 3), dtype=np.int16)
        arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        plant_img = Image.fromarray(arr, mode="RGB")
        is_valid, msg = _validate_orchid_image(plant_img)
        assert is_valid is True
        assert msg == "Valid orchid"

    def test_textured_orchid_floral_image_accepted(self):
        """Synthetic textured orchid floral image with purple/magenta blossom colors should pass."""
        arr = np.full((200, 200, 3), 100, dtype=np.uint8)
        arr[20:180, 20:180] = [186, 85, 211]  # Medium Orchid petal color
        rng = np.random.RandomState(42)
        noise = rng.randint(-10, 10, size=(200, 200, 3), dtype=np.int16)
        arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        flower_img = Image.fromarray(arr, mode="RGB")
        is_valid, msg = _validate_orchid_image(flower_img)
        assert is_valid is True
        assert msg == "Valid orchid"

    def test_document_high_edge_zero_green_rejected(self):
        """High-contrast black and white text/document image should be rejected."""
        doc_img = Image.new("RGB", (300, 300), color=(240, 240, 240))
        draw = ImageDraw.Draw(doc_img)
        for y in range(20, 280, 10):
            draw.line([(20, y), (280, y)], fill=(0, 0, 0), width=2)
        is_valid, msg = _validate_orchid_image(doc_img)
        assert is_valid is False
        assert "document" in msg.lower() or "non-orchid" in msg.lower()
