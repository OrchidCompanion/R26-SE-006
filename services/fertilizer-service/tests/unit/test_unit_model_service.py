import cv2
import numpy as np
import pytest
from model_service import (
    calculate_leaf_length_v3,
    calculate_leaf_width_v2,
    skeletonize_mask,
)


def test_calculate_leaf_length_invalid_inputs():
    """Verify NaN handling for missing or invalid parameters."""
    length, length_px, tip, base, skel, cnt = calculate_leaf_length_v3(None, pixels_per_cm=100.0)
    assert np.isnan(length)
    assert tip is None

    # Invalid pixels_per_cm
    mask = np.ones((100, 100), dtype=np.uint8)
    length, _, _, _, _, _ = calculate_leaf_length_v3(mask, pixels_per_cm=0)
    assert np.isnan(length)

    length, _, _, _, _, _ = calculate_leaf_length_v3(mask, pixels_per_cm=-10.0)
    assert np.isnan(length)


def test_calculate_leaf_length_synthetic_mask():
    """Verify leaf length calculation on a known geometric shape (vertical ellipse)."""
    mask = np.zeros((300, 300), dtype=np.uint8)
    # Draw an ellipse centered at (150, 150) with major axis 100 px (length ~200 px), minor axis 30 px
    cv2.ellipse(mask, (150, 150), (30, 100), 0, 0, 360, 255, -1)

    pixels_per_cm = 50.0  # 200 px should be roughly 4.0 cm
    length_cm, length_px, tip, base, skel, cnt = calculate_leaf_length_v3(mask, pixels_per_cm=pixels_per_cm)

    assert not np.isnan(length_cm)
    assert length_cm > 0.0
    # Length should be approximately 3.0 to 4.5 cm
    assert 3.0 <= length_cm <= 4.5
    assert tip is not None
    assert base is not None


def test_calculate_leaf_width_invalid_inputs():
    """Verify NaN handling for invalid contours and scale."""
    width, line = calculate_leaf_width_v2(None, pixels_per_cm=100.0)
    assert np.isnan(width)
    assert line is None

    # Contour with fewer than 3 points
    small_cnt = np.array([[[10, 10]], [[20, 20]]], dtype=np.int32)
    width, line = calculate_leaf_width_v2(small_cnt, pixels_per_cm=100.0)
    assert np.isnan(width)


def test_calculate_leaf_width_synthetic_contour():
    """Verify leaf width calculation on a synthetic horizontal ellipse."""
    mask = np.zeros((300, 300), dtype=np.uint8)
    # Draw ellipse: center (150, 150), major axis radius 80, minor axis radius 25
    cv2.ellipse(mask, (150, 150), (25, 80), 0, 0, 360, 255, -1)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    assert len(contours) > 0

    pixels_per_cm = 50.0  # 50 px minor diameter (width) should be ~1.0 cm
    width_cm, width_line = calculate_leaf_width_v2(contours[0], pixels_per_cm=pixels_per_cm)

    assert not np.isnan(width_cm)
    assert width_cm > 0.0
    # Width should be around 0.8 - 1.2 cm
    assert 0.7 <= width_cm <= 1.3
    assert width_line is not None
    assert len(width_line) == 2


def test_skeletonize_mask():
    """Verify skeleton thinning produces thinner or equal non-zero pixels."""
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (80, 80), 255, -1)
    skeleton = skeletonize_mask(mask)

    orig_count = cv2.countNonZero(mask)
    skel_count = cv2.countNonZero(skeleton)

    assert skel_count > 0
    assert skel_count < orig_count


def test_analyze_leaf_and_growth_raises_when_no_leaf_detected():
    """Verify ValueError is raised when YOLO model does not detect any leaf in the image."""
    from unittest.mock import patch, MagicMock
    from model_service import analyze_leaf_and_growth

    mock_yolo = MagicMock()
    mock_yolo_result = MagicMock()
    mock_yolo_result.masks = None
    mock_yolo.return_value = [mock_yolo_result]

    with patch("model_service.load_fertilizer_models", return_value=(mock_yolo, MagicMock(), MagicMock())):
        dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
        with pytest.raises(ValueError, match="Leaf not detected"):
            analyze_leaf_and_growth(dummy_img, leaf_count=2)

