import base64
from pathlib import Path
from typing import Tuple, Dict, Any, Optional
import cv2
import numpy as np
import pandas as pd
import joblib
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

COIN_DIAMETER_CM = 2.3
PIXELS_PER_CM_FIXED = 212.85
COIN_CLASS = 0
LEAF_CLASS = 1

_leaf_yolo: Optional[YOLO] = None
_growth_model = None
_growth_encoder = None


def _find_model_file(filename: str) -> Path:
    p = MODELS_DIR / filename
    if p.exists():
        return p
    # Fallback to ml-service folder
    alt = BASE_DIR.parent.parent / "ml-service" / filename
    if alt.exists():
        return alt
    raise FileNotFoundError(f"Missing {filename} in {MODELS_DIR} or {alt}")


def load_fertilizer_models():
    global _leaf_yolo, _growth_model, _growth_encoder
    if _leaf_yolo is None:
        p_yolo = _find_model_file("leaf_segmentation_best.pt")
        print(f"[ModelService] Loading Leaf Segmentation YOLO from {p_yolo}...")
        _leaf_yolo = YOLO(str(p_yolo))

    if _growth_model is None or _growth_encoder is None:
        p_gm = _find_model_file("growth_stage_model.pkl")
        p_enc = _find_model_file("label_encoder.pkl")
        print(f"[ModelService] Loading Growth Stage Classifier from {p_gm}...")
        _growth_model = joblib.load(str(p_gm))
        _growth_encoder = joblib.load(str(p_enc))

    return _leaf_yolo, _growth_model, _growth_encoder


# ============================================================
# Skeletonization helper for Length v3
# ============================================================

def skeletonize_mask(binary_mask):
    """
    Convert the leaf mask into a skeleton.
    Used only to help identify the two ends of the leaf.
    """
    mask = np.where(binary_mask > 0, 255, 0).astype(np.uint8)

    if hasattr(cv2, "ximgproc"):
        try:
            return cv2.ximgproc.thinning(mask)
        except Exception:
            pass

    skeleton = np.zeros_like(mask)
    current = mask.copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))

    while True:
        eroded = cv2.erode(current, kernel)
        opened = cv2.dilate(eroded, kernel)
        difference = cv2.subtract(current, opened)
        skeleton = cv2.bitwise_or(skeleton, difference)
        current = eroded

        if cv2.countNonZero(current) == 0:
            break

    return skeleton


# ============================================================
# Length v3 - PCA Tip-to-Base Measurement
# ============================================================

def calculate_leaf_length_v3(leaf_mask, pixels_per_cm):
    """
    Calculate Dendrobium leaf length using tip-to-base
    straight-line distance (PCA major-axis based).
    """

    if leaf_mask is None or pixels_per_cm is None or pixels_per_cm <= 0:
        return np.nan, np.nan, None, None, None, None

    mask = np.asarray(leaf_mask)

    if mask.ndim > 2:
        mask = np.squeeze(mask)

    mask = (mask > 0).astype(np.uint8) * 255

    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    skeleton = skeletonize_mask(mask)
    skeleton_binary = (skeleton > 0).astype(np.uint8)

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_NONE
    )

    if len(contours) == 0:
        return np.nan, np.nan, None, None, None, skeleton

    contour = max(contours, key=cv2.contourArea)

    if cv2.contourArea(contour) < 100:
        return np.nan, np.nan, None, None, contour, skeleton

    points = contour.reshape(-1, 2).astype(np.float32)

    if len(points) < 10:
        return np.nan, np.nan, None, None, contour, skeleton

    # PCA
    mean = np.mean(points, axis=0)
    centered = points - mean
    covariance = np.cov(centered.T)

    eigenvalues, eigenvectors = np.linalg.eigh(covariance)

    major_axis = eigenvectors[:, np.argmax(eigenvalues)]
    major_axis = major_axis / np.linalg.norm(major_axis)

    perpendicular_axis = np.array(
        [-major_axis[1], major_axis[0]],
        dtype=np.float32
    )

    longitudinal = centered @ major_axis
    transverse = centered @ perpendicular_axis

    min_longitudinal = np.min(longitudinal)
    max_longitudinal = np.max(longitudinal)

    total_length_axis = max_longitudinal - min_longitudinal

    if total_length_axis <= 0:
        return np.nan, np.nan, None, None, contour, skeleton

    # Skeleton endpoints
    ys, xs = np.where(skeleton_binary > 0)
    skeleton_padded = np.pad(skeleton_binary, 1, mode="constant")

    endpoints = []

    for y, x in zip(ys, xs):
        yy, xx = y + 1, x + 1

        neighborhood = skeleton_padded[
            yy - 1:yy + 2,
            xx - 1:xx + 2
        ]

        neighbors = np.sum(neighborhood) - 1

        if neighbors == 1:
            endpoints.append((x, y))

    best_pair = None
    max_distance = -1

    if len(endpoints) >= 2:
        for i in range(len(endpoints)):
            for j in range(i + 1, len(endpoints)):
                p1 = np.array(endpoints[i], dtype=np.float32)
                p2 = np.array(endpoints[j], dtype=np.float32)

                distance = np.linalg.norm(p2 - p1)

                if distance > max_distance:
                    max_distance = distance
                    best_pair = (endpoints[i], endpoints[j])

    endpoint_a = endpoint_b = None
    endpoint_a_projection = endpoint_b_projection = None

    if best_pair is not None:
        endpoint_a = np.array(best_pair[0], dtype=np.float32)
        endpoint_b = np.array(best_pair[1], dtype=np.float32)

        endpoint_a_projection = (endpoint_a - mean) @ major_axis
        endpoint_b_projection = (endpoint_b - mean) @ major_axis

    # Determine narrower tip and wider base
    section_size = max(total_length_axis * 0.08, 5.0)

    left_mask = longitudinal <= min_longitudinal + section_size
    right_mask = longitudinal >= max_longitudinal - section_size

    left_points = points[left_mask]
    right_points = points[right_mask]

    if len(left_points) < 3 or len(right_points) < 3:
        return np.nan, np.nan, None, None, contour, skeleton

    left_transverse = (left_points - mean) @ perpendicular_axis
    right_transverse = (right_points - mean) @ perpendicular_axis

    left_width = np.max(left_transverse) - np.min(left_transverse)
    right_width = np.max(right_transverse) - np.min(right_transverse)

    if left_width < right_width:
        tip_side, base_side = "left", "right"
    else:
        tip_side, base_side = "right", "left"

    # Tip point
    tip_section_size = max(total_length_axis * 0.04, 3.0)

    if tip_side == "left":
        tip_region_points = points[
            longitudinal <= min_longitudinal + tip_section_size
        ]
    else:
        tip_region_points = points[
            longitudinal >= max_longitudinal - tip_section_size
        ]

    if len(tip_region_points) == 0:
        tip_index = (
            np.argmin(longitudinal)
            if tip_side == "left"
            else np.argmax(longitudinal)
        )
        tip_point = points[tip_index]
    else:
        tip_longitudinal = tip_region_points @ major_axis

        tip_index = (
            np.argmin(tip_longitudinal)
            if tip_side == "left"
            else np.argmax(tip_longitudinal)
        )

        tip_point = tip_region_points[tip_index]

    # Base point
    base_section_size = max(total_length_axis * 0.10, 5.0)

    if base_side == "left":
        base_region_mask = (
            longitudinal <= min_longitudinal + base_section_size
        )
    else:
        base_region_mask = (
            longitudinal >= max_longitudinal - base_section_size
        )

    base_region_points = points[base_region_mask]

    if len(base_region_points) >= 3:
        base_center = np.array(
            [
                np.median(base_region_points[:, 0]),
                np.median(base_region_points[:, 1])
            ],
            dtype=np.float32
        )

        base_distances = np.linalg.norm(
            base_region_points - base_center,
            axis=1
        )

        base_point = base_region_points[np.argmin(base_distances)]

    elif endpoint_b is not None:
        if base_side == "left":
            base_point = (
                endpoint_a
                if endpoint_a_projection < endpoint_b_projection
                else endpoint_b
            )
        else:
            base_point = (
                endpoint_a
                if endpoint_a_projection > endpoint_b_projection
                else endpoint_b
            )
    else:
        base_index = (
            np.argmin(longitudinal)
            if base_side == "left"
            else np.argmax(longitudinal)
        )

        base_point = points[base_index]

    dx = base_point[0] - tip_point[0]
    dy = base_point[1] - tip_point[1]

    length_pixels = np.sqrt(dx ** 2 + dy ** 2)
    length_cm = length_pixels / pixels_per_cm

    tip_point = (
        int(round(tip_point[0])),
        int(round(tip_point[1]))
    )

    base_point = (
        int(round(base_point[0])),
        int(round(base_point[1]))
    )

    return (
        float(length_cm),
        float(length_pixels),
        tip_point,
        base_point,
        contour,
        skeleton
    )


# ============================================================
# Width v2 - PCA Maximum Perpendicular Cross-Section
# ============================================================

def calculate_leaf_width_v2(contour, pixels_per_cm):
    """
    Estimate maximum leaf width using perpendicular
    cross-sections along the PCA major axis.
    """

    if contour is None or pixels_per_cm <= 0:
        return np.nan, None

    points = contour.reshape(-1, 2).astype(np.float64)

    if len(points) < 3:
        return np.nan, None

    # PCA major axis
    center = np.mean(points, axis=0)
    centered = points - center

    covariance = np.cov(centered.T)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)

    major_axis = eigenvectors[:, np.argmax(eigenvalues)]
    major_axis /= np.linalg.norm(major_axis)

    # Perpendicular direction
    perpendicular_axis = np.array([
        -major_axis[1],
        major_axis[0]
    ])

    # Project contour onto both axes
    longitudinal = centered @ major_axis
    transverse = centered @ perpendicular_axis

    min_long = np.min(longitudinal)
    max_long = np.max(longitudinal)

    max_width_pixels = 0.0
    best_line = None

    # Sample 200 sections
    sections = np.linspace(min_long, max_long, 200)

    slice_half_width = max(
        (max_long - min_long) / 400,
        0.5
    )

    for position in sections:
        selected = (
            np.abs(longitudinal - position) <= slice_half_width
        )

        if np.count_nonzero(selected) < 2:
            continue

        section_values = transverse[selected]

        min_t = np.min(section_values)
        max_t = np.max(section_values)

        width_pixels = max_t - min_t

        if width_pixels > max_width_pixels:
            max_width_pixels = width_pixels

            p1 = (
                center
                + position * major_axis
                + min_t * perpendicular_axis
            )

            p2 = (
                center
                + position * major_axis
                + max_t * perpendicular_axis
            )

            best_line = (
                tuple(np.round(p1).astype(int)),
                tuple(np.round(p2).astype(int))
            )

    if max_width_pixels <= 0:
        return np.nan, None

    width_cm = max_width_pixels / pixels_per_cm

    return float(width_cm), best_line


# ============================================================
# Original Analysis Function
# Only Length and Width calculations updated
# ============================================================

def analyze_leaf_and_growth(img_bgr: np.ndarray, leaf_count: int) -> Dict[str, Any]:
    """
    Performs YOLO instance segmentation on leaf and reference coin,
    computes physical measurements (length, width, area), and predicts growth stage.
    """
    leaf_count = max(1, int(leaf_count))
    leaf_yolo, growth_model, encoder = load_fertilizer_models()

    results = leaf_yolo(img_bgr, conf=0.25, verbose=False)
    detected_leaves = []
    detected_coins = []

    for r in results:
        if r.masks is None:
            continue
        masks = r.masks.data.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy()
        confidences = r.boxes.conf.cpu().numpy()

        for mask, cls, conf in zip(masks, classes, confidences):
            m = cv2.resize(mask, (r.orig_shape[1], r.orig_shape[0]), interpolation=cv2.INTER_NEAREST)
            bin_m = (m > 0.5).astype(np.uint8)
            area = cv2.countNonZero(bin_m)
            if area == 0:
                continue
            if int(cls) == COIN_CLASS:
                detected_coins.append({"mask": bin_m, "area": area})
            elif int(cls) == LEAF_CLASS:
                detected_leaves.append({"mask": bin_m, "area": area})

    # Reference coin calibration
    if detected_coins:
        max_coin = max(detected_coins, key=lambda x: x["area"])
        pixels_per_cm = (np.sqrt((4 * max_coin["area"]) / np.pi) / COIN_DIAMETER_CM)
    else:
        max_coin = None
        pixels_per_cm = PIXELS_PER_CM_FIXED

    contour = None
    _tip = None
    _base = None
    _width_line = None

    if not detected_leaves:
        raise ValueError("Leaf not detected. Please ensure an orchid leaf is clearly visible in the image.")

    largest_leaf = max(detected_leaves, key=lambda x: x["area"])
    leaf_area_cm2 = largest_leaf["area"] / (pixels_per_cm ** 2)

    contours, _ = cv2.findContours(largest_leaf["mask"], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if contours:
        contour = max(contours, key=cv2.contourArea)

        # Width v2
        width_cm, _width_line = calculate_leaf_width_v2(
            contour,
            pixels_per_cm
        )

        # Length v3
        length_cm, _length_pixels, _tip, _base, _contour, _skeleton = calculate_leaf_length_v3(
            largest_leaf["mask"],
            pixels_per_cm
        )
    else:
        length_cm = 8.0
        width_cm = 2.5

    input_df = pd.DataFrame({
        "opencv_leaf_length_cm": [length_cm],
        "opencv_leaf_width_cm": [width_cm],
        "opencv_leaf_area_cm2": [leaf_area_cm2],
        "leaf_count": [leaf_count],
    })

    pred = growth_model.predict(input_df)[0]
    prob = float(np.max(growth_model.predict_proba(input_df)[0]))
    growth_stage = str(encoder.inverse_transform([pred])[0])

    # Draw marked leaf image with length (tip-to-base) and width lines
    marked_bgr = img_bgr.copy()


    # 1. Draw Tip-to-Base Length Line (Sky Blue / Cyan line)
    if _tip is not None and _base is not None:
        p_tip = (int(round(_tip[0])), int(round(_tip[1])))
        p_base = (int(round(_base[0])), int(round(_base[1])))
        cv2.line(marked_bgr, p_tip, p_base, (255, 140, 0), 3, cv2.LINE_AA)

        # Tip point (Red circle)
        cv2.circle(marked_bgr, p_tip, 7, (0, 0, 255), -1, cv2.LINE_AA)
        cv2.circle(marked_bgr, p_tip, 8, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(marked_bgr, "Tip", (p_tip[0] + 8, p_tip[1] - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2, cv2.LINE_AA)

        # Base point (Yellow circle)
        cv2.circle(marked_bgr, p_base, 7, (0, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(marked_bgr, p_base, 8, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(marked_bgr, "Base", (p_base[0] + 8, p_base[1] + 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2, cv2.LINE_AA)

        # Length text label
        mid_x = (p_tip[0] + p_base[0]) // 2
        mid_y = (p_tip[1] + p_base[1]) // 2
        cv2.putText(marked_bgr, f"L: {float(length_cm):.2f}cm", (mid_x + 10, mid_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 140, 0), 2, cv2.LINE_AA)

    # 2. Draw Maximum Width Line (Red line)
    if _width_line is not None and len(_width_line) == 2 and _width_line[0] is not None:
        wp1 = (int(round(_width_line[0][0])), int(round(_width_line[0][1])))
        wp2 = (int(round(_width_line[1][0])), int(round(_width_line[1][1])))
        cv2.line(marked_bgr, wp1, wp2, (0, 0, 255), 3, cv2.LINE_AA)
        cv2.circle(marked_bgr, wp1, 6, (0, 0, 255), -1, cv2.LINE_AA)
        cv2.circle(marked_bgr, wp2, 6, (0, 0, 255), -1, cv2.LINE_AA)

        w_mid_x = (wp1[0] + wp2[0]) // 2
        w_mid_y = (wp1[1] + wp2[1]) // 2
        cv2.putText(marked_bgr, f"W: {float(width_cm):.2f}cm", (w_mid_x + 10, w_mid_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2, cv2.LINE_AA)

    # Encode marked image to base64 JPEG
    _, buf = cv2.imencode(".jpg", marked_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    marked_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
    marked_image_uri = f"data:image/jpeg;base64,{marked_b64}"

    return {
        "leaf_length_cm": round(float(length_cm), 2),
        "leaf_width_cm": round(float(width_cm), 2),
        "leaf_area_cm2": round(float(leaf_area_cm2), 2),
        "leaf_count": leaf_count,
        "growth_stage": growth_stage,
        "confidence": round(prob, 4),
        "marked_image": marked_image_uri,
    }

