import numpy as np

from model_service import DISEASE_CLASSES


def test_disease_class_order():
    assert DISEASE_CLASSES == [
        "bacterial_brown_spot",
        "black_rot",
        "healthy",
        "invalid",
    ]


def test_mobilenet_cnn_fusion_picks_black_rot():
    mb = np.array([0.10, 0.70, 0.15, 0.05], dtype=np.float32)
    cnn = np.array([0.40, 0.35, 0.20, 0.05], dtype=np.float32)
    fused = 0.55 * mb + 0.45 * cnn
    assert DISEASE_CLASSES[int(np.argmax(fused))] == "black_rot"
    assert float(fused[1]) > 0.5
