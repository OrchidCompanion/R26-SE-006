import io
import cv2
import numpy as np
import pytest
from PIL import Image

from model_service import (
    MODELS_DIR,
    BLOOMING_STAGES,
    STAGE_CLASS_MAP,
    NEXT_STAGE_MAP,
    MODEL02_FEATURE_ORDER,
    load_bloom_models,
    validate_orchid_image,
    predict_single_image_stage,
    forecast_blooming_timeline,
)


def _generate_synthetic_orchid_image(valid_green: bool = True) -> io.BytesIO:
    """Helper to generate a synthetic RGB image for integration tests."""
    arr = np.zeros((100, 100, 3), dtype=np.uint8)
    if valid_green:
        # Draw green leaf patch: Forest green RGB (34, 139, 34)
        cv2.circle(arr, (50, 50), 35, (34, 139, 34), -1)
    # else leaves it as solid black blank

    pil_img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


@pytest.mark.integration
def test_real_models_loaded_properly():
    """Integration test verifying real blooming model weights and stage mappings."""
    # Verify model directory and weights exist on disk
    assert MODELS_DIR.exists()
    p01 = MODELS_DIR / "checkpoint_best_total.pth"
    p02 = MODELS_DIR / "gradient_boosting_experiment.joblib"

    assert p01.exists(), f"Model 01 weights not found at {p01}"
    assert p02.exists(), f"Model 02 weights not found at {p02}"

    # Verify stage progression dictionary and taxonomy
    assert "Seedling" in BLOOMING_STAGES
    assert "Vegetative" in BLOOMING_STAGES
    assert "Mature_Pseudobulb" in BLOOMING_STAGES
    assert "Bud_formation" in BLOOMING_STAGES
    assert "Flowering" in BLOOMING_STAGES

    assert STAGE_CLASS_MAP[0] == "Bud_formation"
    assert STAGE_CLASS_MAP[1] == "Flowering"
    assert STAGE_CLASS_MAP[4] == "Seedling"
    assert STAGE_CLASS_MAP[5] == "Vegetative"

    assert NEXT_STAGE_MAP["Bud_formation"] == "Flowering"
    assert NEXT_STAGE_MAP["Flowering"] is None

    # Verify real models load
    m1, m2 = load_bloom_models()
    assert m1 is not None
    assert m2 is not None


@pytest.mark.integration
def test_real_orchid_image_validation_pipeline(client):
    """Integration test: Tests /validate-image endpoint with real botanical image analysis."""
    # 1. Valid orchid foliage photo
    valid_buf = _generate_synthetic_orchid_image(valid_green=True)
    res_valid = client.post(
        "/validate-image",
        files={"image": ("orchid.jpg", valid_buf, "image/jpeg")},
    )
    assert res_valid.status_code == 200
    data_valid = res_valid.json()
    assert data_valid["is_valid"] is True
    assert data_valid["error"] is None

    # 2. Blank solid black photo (fails botanical validation)
    blank_buf = _generate_synthetic_orchid_image(valid_green=False)
    res_blank = client.post(
        "/validate-image",
        files={"image": ("blank.jpg", blank_buf, "image/jpeg")},
    )
    assert res_blank.status_code == 200
    data_blank = res_blank.json()
    assert data_blank["is_valid"] is False
    assert "blank" in data_blank["error"].lower()


@pytest.mark.integration
def test_real_image_prediction_pipeline_non_orchid_returns_422(client):
    """Integration test: Real validation filter rejects non-plant images on /predict with 422."""
    b1 = _generate_synthetic_orchid_image(valid_green=False)
    b2 = _generate_synthetic_orchid_image(valid_green=False)
    b3 = _generate_synthetic_orchid_image(valid_green=False)

    res = client.post(
        "/predict",
        data={"user_id": "test_user_int", "plant_id": "orchid_int_01"},
        files={
            "image1": ("non1.jpg", b1, "image/jpeg"),
            "image2": ("non2.jpg", b2, "image/jpeg"),
            "image3": ("non3.jpg", b3, "image/jpeg"),
        },
    )

    # Must be rejected as invalid non-orchid image
    assert res.status_code == 422
    assert "non-orchid" in res.json()["detail"].lower()


@pytest.mark.integration
def test_real_model_timeline_forecasting_integration():
    """Integration test: Tests blooming timeline forecasting logic and progression sequence."""
    sensor_stats = {
        "avg_temp_c": 27.5,
        "min_temp_c": 24.0,
        "max_temp_c": 31.0,
        "temp_std_c": 2.1,
        "avg_humidity_rh": 72.0,
        "min_humidity_rh": 65.0,
        "max_humidity_rh": 80.0,
        "humidity_std_rh": 4.5,
        "avg_light_lux": 22000.0,
        "min_light_lux": 15000.0,
        "max_light_lux": 28000.0,
        "light_std_lux": 3500.0,
    }

    # 1. Flowering stage requires 0 days
    flowering_days, flowering_timeline = forecast_blooming_timeline("Flowering", sensor_stats)
    assert flowering_days == 0.0
    assert flowering_timeline == []

    # 2. Vegetative stage forecast
    veg_days, veg_timeline = forecast_blooming_timeline("Vegetative", sensor_stats)
    assert veg_days > 0.0
    assert len(veg_timeline) >= 1
    # Check transitions adhere to botanical sequence
    stages_in_path = [step["from_stage"] for step in veg_timeline]
    assert "Vegetative" in stages_in_path
    assert veg_timeline[-1]["to_stage"] == "Flowering"

    # 3. Bud_formation forecast should lead directly to Flowering
    bud_days, bud_timeline = forecast_blooming_timeline("Bud_formation", sensor_stats)
    assert bud_days > 0.0
    assert len(bud_timeline) == 1
    assert bud_timeline[0]["from_stage"] == "Bud_formation"
    assert bud_timeline[0]["to_stage"] == "Flowering"
