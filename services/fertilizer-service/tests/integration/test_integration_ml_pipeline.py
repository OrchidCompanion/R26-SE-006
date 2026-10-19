import io
import cv2
import numpy as np
import pytest
from model_service import load_fertilizer_models, analyze_leaf_and_growth


@pytest.mark.integration
def test_real_models_loaded_properly():
    """Integration test verifying real YOLO and Random Forest weights load from disk."""
    leaf_yolo, growth_model, encoder = load_fertilizer_models()

    assert leaf_yolo is not None
    assert growth_model is not None
    assert encoder is not None

    # Assert model class names match the 3 research growth stages
    assert set(encoder.classes_) == {"Vegetative", "Pre Flowering", "Matured"}


@pytest.mark.integration
def test_real_yolo_non_leaf_image_returns_422(client):
    """Integration test: Real YOLO pipeline processes non-leaf photo (bottle/blank) and returns 422."""
    # Synthetic non-leaf image (blank black image)
    blank_bgr = np.zeros((400, 400, 3), dtype=np.uint8)
    _, img_encoded = cv2.imencode(".jpg", blank_bgr)
    img_bytes = io.BytesIO(img_encoded.tobytes())

    response = client.post(
        "/analyze",
        data={"leaf_count": 2},
        files={"image": ("blank.jpg", img_bytes, "image/jpeg")},
    )

    # Real YOLO will detect 0 leaves and trigger the 422 exception
    assert response.status_code == 422
    assert "Leaf not detected" in response.json()["detail"]


@pytest.mark.integration
def test_real_model_growth_stage_classifier():
    """Integration test: Tests RandomForest model and label encoder inference directly."""
    import pandas as pd
    _, growth_model, encoder = load_fertilizer_models()

    # Feed realistic leaf physical measurements into the real Random Forest classifier
    input_sample = pd.DataFrame({
        "opencv_leaf_length_cm": [14.5],
        "opencv_leaf_width_cm": [3.8],
        "opencv_leaf_area_cm2": [38.2],
        "leaf_count": [4],
    })

    pred = growth_model.predict(input_sample)[0]
    predicted_stage = str(encoder.inverse_transform([pred])[0])
    prob = float(np.max(growth_model.predict_proba(input_sample)[0]))

    # Must be one of the 3 validated stages
    assert predicted_stage in {"Vegetative", "Pre Flowering", "Matured"}
    assert 0.0 <= prob <= 1.0
