from unittest.mock import MagicMock, patch
import numpy as np
import cv2
from PIL import Image
import pytest

from model_service import (
    BLOOMING_STAGES,
    STAGE_CLASS_MAP,
    NEXT_STAGE_MAP,
    MODEL02_FEATURE_ORDER,
    validate_orchid_image,
    predict_single_image_stage,
    forecast_blooming_timeline,
    load_bloom_models,
)

pytestmark = pytest.mark.unit



def test_constants_and_stage_mappings():
    """Verify standard biological stages and pipeline mappings."""
    expected_stages = [
        "Seedling",
        "Vegetative",
        "Mature_Pseudobulb",
        "Bud_formation",
        "Flowering",
    ]
    assert BLOOMING_STAGES == expected_stages

    # Verify stage progression chain
    assert NEXT_STAGE_MAP["Seedling"] == "Vegetative"
    assert NEXT_STAGE_MAP["Vegetative"] == "Mature_Pseudobulb"
    assert NEXT_STAGE_MAP["Mature_Pseudobulb"] == "Bud_formation"
    assert NEXT_STAGE_MAP["Bud_formation"] == "Flowering"
    assert NEXT_STAGE_MAP["Flowering"] is None

    # Verify RF-DETR class IDs
    assert STAGE_CLASS_MAP[0] == "Bud_formation"
    assert STAGE_CLASS_MAP[1] == "Flowering"
    assert STAGE_CLASS_MAP[2] == "Invalid"
    assert STAGE_CLASS_MAP[3] == "Mature_Pseudobulb"
    assert STAGE_CLASS_MAP[4] == "Seedling"
    assert STAGE_CLASS_MAP[5] == "Vegetative"

    # Verify Gradient Boosting required features count (15 features)
    assert len(MODEL02_FEATURE_ORDER) == 15
    assert "current_stage" in MODEL02_FEATURE_ORDER
    assert "avg_temp_c" in MODEL02_FEATURE_ORDER
    assert "avg_humidity_rh" in MODEL02_FEATURE_ORDER
    assert "avg_light_lux" in MODEL02_FEATURE_ORDER


def test_validate_orchid_image_solid_color():
    """Verify solid color blank images fail validation."""
    blank_white = Image.new("RGB", (100, 100), (255, 255, 255))
    is_valid, msg = validate_orchid_image(blank_white)
    assert not is_valid
    assert "blank solid color" in msg

    blank_black = Image.new("RGB", (100, 100), (0, 0, 0))
    is_valid, msg = validate_orchid_image(blank_black)
    assert not is_valid
    assert "blank solid color" in msg


def test_validate_orchid_image_empty_array():
    """Verify 0-size image fails validation."""
    empty_img = Image.new("RGB", (0, 0))
    is_valid, msg = validate_orchid_image(empty_img)
    assert not is_valid
    assert "empty or unreadable" in msg


def test_validate_orchid_image_high_edge_non_plant():
    """Verify high-frequency edge textures without green foliage fail validation."""
    # Create black and white block pattern (high edge energy, no green/floral)
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    arr[::8, :] = 255
    striped_img = Image.fromarray(arr, "RGB")

    is_valid, msg = validate_orchid_image(striped_img)
    assert not is_valid
    assert "Invalid Image detected" in msg


def test_validate_orchid_image_no_foliage_or_flowers():
    """Verify images without green or floral tones fail validation."""
    # Red gradient image with mild variation (low edges, no green or pink/yellow floral)
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    arr[:, :, 0] = np.linspace(150, 180, 100, dtype=np.uint8)[:, None]
    non_plant_img = Image.fromarray(arr, "RGB")

    is_valid, msg = validate_orchid_image(non_plant_img)
    assert not is_valid
    assert "Non-orchid image detected" in msg


def test_validate_orchid_image_valid_green_foliage():
    """Verify synthetic image with green foliage passes botanical validation."""
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    # Draw green leaf patch: Forest green RGB (34, 139, 34)
    cv2.circle(arr, (50, 50), 35, (34, 139, 34), -1)
    green_img = Image.fromarray(arr, "RGB")

    is_valid, msg = validate_orchid_image(green_img)
    assert is_valid
    assert msg == "Valid orchid"


def test_validate_orchid_image_valid_floral_pink():
    """Verify synthetic image with pink orchid blossom passes botanical validation."""
    arr = np.full((100, 100, 3), (200, 180, 190), dtype=np.uint8)
    # Pink RGB (230, 80, 180) -> HSV (H ~ 155 in OpenCV HSV scale)
    cv2.circle(arr, (50, 50), 35, (230, 80, 180), -1)
    pink_img = Image.fromarray(arr, "RGB")

    is_valid, msg = validate_orchid_image(pink_img)
    assert is_valid
    assert msg == "Valid orchid"


def test_validate_orchid_image_valid_floral_yellow():
    """Verify synthetic image with yellow orchid blossom passes botanical validation."""
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    # Yellow RGB (240, 220, 30) -> HSV (H ~ 27 in OpenCV HSV scale)
    cv2.circle(arr, (50, 50), 35, (240, 220, 30), -1)
    yellow_img = Image.fromarray(arr, "RGB")

    is_valid, msg = validate_orchid_image(yellow_img)
    assert is_valid
    assert msg == "Valid orchid"


def test_validate_orchid_image_exception_fallback():
    """Verify that unexpected exceptions in image processing fallback safely to valid."""
    bad_obj = MagicMock()
    bad_obj.convert.side_effect = RuntimeError("PIL conversion error")

    is_valid, msg = validate_orchid_image(bad_obj)
    assert is_valid
    assert msg == "Valid orchid"


def test_load_bloom_models_missing_paths():
    """Verify load_bloom_models safely handles missing weight files without throwing."""
    with patch("model_service.MODELS_DIR") as mock_dir:
        mock_path = MagicMock()
        mock_path.exists.return_value = False
        mock_dir.__truediv__.return_value = mock_path

        # Reset global model caches for clean test
        with patch("model_service._model01", None), patch("model_service._model02", None):
            m01, m02 = load_bloom_models()
            assert m01 is None
            assert m02 is None


def test_predict_single_image_stage_when_invalid_image():
    """Verify predict_single_image_stage halts early if botanical validation fails."""
    with patch("model_service.validate_orchid_image", return_value=(False, "Not an orchid")):
        stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
        assert stage == "Invalid"
        assert conf == 0.0
        assert not is_valid
        assert err == "Not an orchid"


def test_predict_single_image_stage_when_model_not_loaded():
    """Verify predict_single_image_stage returns descriptive error if model01 is None."""
    with patch("model_service.validate_orchid_image", return_value=(True, "Valid orchid")):
        with patch("model_service.load_bloom_models", return_value=(None, None)):
            stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
            assert stage == "Invalid"
            assert conf == 0.0
            assert not is_valid
            assert "AI model is not loaded" in err


def test_predict_single_image_stage_unsupported_model_type():
    """Verify error returned when model01 tuple has unsupported architecture."""
    with patch("model_service.validate_orchid_image", return_value=(True, "Valid orchid")):
        with patch("model_service.load_bloom_models", return_value=(("torch", MagicMock()), None)):
            stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
            assert stage == "Invalid"
            assert not is_valid
            assert "Unsupported model type 'torch'" in err


def test_predict_single_image_stage_rfdetr_empty_or_low_confidence():
    """Verify RF-DETR returns Invalid when predicted confidence is below 0.15 threshold."""
    mock_rfdetr = MagicMock()
    mock_res = MagicMock()
    mock_res.confidence = np.array([0.10])
    mock_res.class_id = np.array([0])
    mock_rfdetr.predict.return_value = mock_res

    with patch("model_service.validate_orchid_image", return_value=(True, "Valid orchid")):
        with patch("model_service.load_bloom_models", return_value=(("rfdetr", mock_rfdetr), None)):
            stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
            assert stage == "Invalid"
            assert conf == 0.0
            assert not is_valid
            assert "Could not identify orchid blooming stage" in err


def test_predict_single_image_stage_rfdetr_successful_prediction():
    """Verify RF-DETR correctly maps predicted class ID to blooming stage."""
    mock_rfdetr = MagicMock()
    mock_res = MagicMock()
    mock_res.confidence = np.array([0.91, 0.45])
    mock_res.class_id = np.array([0, 5])  # 0: Bud_formation
    mock_rfdetr.predict.return_value = mock_res

    with patch("model_service.validate_orchid_image", return_value=(True, "Valid orchid")):
        with patch("model_service.load_bloom_models", return_value=(("rfdetr", mock_rfdetr), None)):
            stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
            assert stage == "Bud_formation"
            assert conf == pytest.approx(0.91, 0.001)
            assert is_valid
            assert err is None


def test_predict_single_image_stage_rfdetr_invalid_class_prediction():
    """Verify RF-DETR predicting class ID 2 (Invalid) returns is_valid=False."""
    mock_rfdetr = MagicMock()
    mock_res = MagicMock()
    mock_res.confidence = np.array([0.88])
    mock_res.class_id = np.array([2])  # 2: Invalid
    mock_rfdetr.predict.return_value = mock_res

    with patch("model_service.validate_orchid_image", return_value=(True, "Valid orchid")):
        with patch("model_service.load_bloom_models", return_value=(("rfdetr", mock_rfdetr), None)):
            stage, conf, is_valid, err = predict_single_image_stage(MagicMock())
            assert stage == "Invalid"
            assert not is_valid
            assert "Could not identify orchid blooming stage" in err


def test_forecast_blooming_timeline_flowering_stage():
    """Verify Flowering stage immediately returns 0 days with empty timeline."""
    total_days, steps = forecast_blooming_timeline("Flowering", {})
    assert total_days == 0.0
    assert steps == []


def test_forecast_blooming_timeline_missing_model():
    """Verify None model02 returns 0 days and empty timeline."""
    with patch("model_service.load_bloom_models", return_value=(None, None)):
        total_days, steps = forecast_blooming_timeline("Vegetative", {})
        assert total_days == 0.0
        assert steps == []


def test_forecast_blooming_timeline_success_progression():
    """Verify multi-stage timeline progression from Mature_Pseudobulb to Flowering."""
    mock_gb = MagicMock()
    # Mock transition predictions: 12.0 days, then 10.0 days
    mock_gb.predict.side_effect = [[12.0], [10.0]]

    sensor_stats = {
        "avg_temp_c": 27.0,
        "min_temp_c": 25.0,
        "max_temp_c": 30.0,
        "temp_std_c": 1.2,
        "avg_humidity_rh": 73.0,
        "min_humidity_rh": 69.0,
        "max_humidity_rh": 76.0,
        "humidity_std_rh": 1.8,
        "avg_light_lux": 22000.0,
        "min_light_lux": 17000.0,
        "max_light_lux": 28000.0,
        "light_std_lux": 2100.0,
    }

    with patch("model_service.load_bloom_models", return_value=(None, mock_gb)):
        total_days, steps = forecast_blooming_timeline("Mature_Pseudobulb", sensor_stats)

        assert total_days == 22.0
        assert len(steps) == 2

        # Step 1: Mature_Pseudobulb -> Bud_formation
        assert steps[0]["from_stage"] == "Mature_Pseudobulb"
        assert steps[0]["to_stage"] == "Bud_formation"
        assert steps[0]["transition_days"] == 12.0
        assert steps[0]["cumulative_days"] == 12.0

        # Step 2: Bud_formation -> Flowering
        assert steps[1]["from_stage"] == "Bud_formation"
        assert steps[1]["to_stage"] == "Flowering"
        assert steps[1]["transition_days"] == 10.0
        assert steps[1]["cumulative_days"] == 22.0


def test_forecast_blooming_timeline_fallback_on_model_exception():
    """Verify fallback biological averages (28d Vegetative, 14d others) are used when predict() throws."""
    mock_gb = MagicMock()
    mock_gb.predict.side_effect = RuntimeError("Feature format error")

    sensor_stats = {}
    with patch("model_service.load_bloom_models", return_value=(None, mock_gb)):
        total_days, steps = forecast_blooming_timeline("Bud_formation", sensor_stats)

        # Bud_formation -> Flowering fallback is 14.0 days
        assert total_days == 14.0
        assert len(steps) == 1
        assert steps[0]["transition_days"] == 14.0
