from ultralytics import YOLO
import cv2
import numpy as np
import pandas as pd
import joblib
import os


# ============================================================
# SETTINGS
# ============================================================

MODEL_PATH = "best.pt"

# CHANGE THIS to the path of the new image you want to test.
# It does NOT need to be in your dataset / Excel file.
NEW_IMAGE_PATH = "test_photos/new_leaf.jpeg"

OUTPUT_OVERLAY = "new_leaf_overlay.jpeg"

# ------------------------------------------------------------
# GROWTH STAGE MODEL
# ------------------------------------------------------------

GROWTH_MODEL_PATH = os.path.join("growth_model_v1", "growth_stage_model.pkl")
ENCODER_PATH = os.path.join("growth_model_v1", "label_encoder.pkl")


# ============================================================
# COIN CALIBRATION
# (same values as calculate_leaf_measurements.py)
# ============================================================

COIN_DIAMETER_CM = 2.3

# Used only when YOLO does not detect a coin
PIXELS_PER_CM_FIXED = 212.85


# ============================================================
# YOLO CLASS IDs
# ============================================================

COIN_CLASS = 0
LEAF_CLASS = 1


# ============================================================
# YOLO CONFIDENCE
# ============================================================

CONF_THRESHOLD = 0.25


# ============================================================
# FUNCTION: SKELETONIZE
# (identical to calculate_leaf_measurements.py)
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
# FUNCTION: CALCULATE LEAF LENGTH (v3, tip-to-base)
# (identical logic to calculate_leaf_measurements.py)
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

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
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
    perpendicular_axis = np.array([-major_axis[1], major_axis[0]], dtype=np.float32)

    longitudinal = centered @ major_axis
    transverse = centered @ perpendicular_axis  # noqa: F841 (kept for parity)

    min_longitudinal = np.min(longitudinal)
    max_longitudinal = np.max(longitudinal)
    total_length_axis = max_longitudinal - min_longitudinal

    if total_length_axis <= 0:
        return np.nan, np.nan, None, None, contour, skeleton

    # Skeleton endpoints (help decide which side is the base)
    ys, xs = np.where(skeleton_binary > 0)
    skeleton_padded = np.pad(skeleton_binary, 1, mode="constant")

    endpoints = []
    for y, x in zip(ys, xs):
        yy, xx = y + 1, x + 1
        neighborhood = skeleton_padded[yy - 1:yy + 2, xx - 1:xx + 2]
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

    # Determine narrower (tip) vs wider (base) end
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
        tip_region_points = points[longitudinal <= min_longitudinal + tip_section_size]
    else:
        tip_region_points = points[longitudinal >= max_longitudinal - tip_section_size]

    if len(tip_region_points) == 0:
        tip_index = np.argmin(longitudinal) if tip_side == "left" else np.argmax(longitudinal)
        tip_point = points[tip_index]
    else:
        tip_longitudinal = tip_region_points @ major_axis
        tip_index = np.argmin(tip_longitudinal) if tip_side == "left" else np.argmax(tip_longitudinal)
        tip_point = tip_region_points[tip_index]

    # Base point (median center of basal 10% region)
    base_section_size = max(total_length_axis * 0.10, 5.0)
    if base_side == "left":
        base_region_mask = longitudinal <= min_longitudinal + base_section_size
    else:
        base_region_mask = longitudinal >= max_longitudinal - base_section_size
    base_region_points = points[base_region_mask]

    if len(base_region_points) >= 3:
        base_center = np.array(
            [np.median(base_region_points[:, 0]), np.median(base_region_points[:, 1])],
            dtype=np.float32,
        )
        base_distances = np.linalg.norm(base_region_points - base_center, axis=1)
        base_point = base_region_points[np.argmin(base_distances)]
    elif endpoint_b is not None:
        if base_side == "left":
            base_point = endpoint_a if endpoint_a_projection < endpoint_b_projection else endpoint_b
        else:
            base_point = endpoint_a if endpoint_a_projection > endpoint_b_projection else endpoint_b
    else:
        base_index = np.argmin(longitudinal) if base_side == "left" else np.argmax(longitudinal)
        base_point = points[base_index]

    dx = base_point[0] - tip_point[0]
    dy = base_point[1] - tip_point[1]
    length_pixels = np.sqrt(dx ** 2 + dy ** 2)
    length_cm = length_pixels / pixels_per_cm

    tip_point = (int(round(tip_point[0])), int(round(tip_point[1])))
    base_point = (int(round(base_point[0])), int(round(base_point[1])))

    return float(length_cm), float(length_pixels), tip_point, base_point, contour, skeleton


# ============================================================
# FUNCTION: CALCULATE LEAF WIDTH
# (identical to calculate_leaf_measurements.py)
# ============================================================

def calculate_leaf_width(contour, pixels_per_cm):
    """
    Width is the shorter side of the minimum-area rotated
    rectangle around the largest leaf.
    """
    rect = cv2.minAreaRect(contour)
    width_pixels = min(rect[1][0], rect[1][1])
    width_cm = width_pixels / pixels_per_cm
    return width_cm, rect


# ============================================================
# MODEL LOADERS (LAZY LOADING FOR FASTAPI / CLI)
# ============================================================

_yolo_model = None
_growth_model = None
_label_encoder = None


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"YOLO model not found: {MODEL_PATH}")
        _yolo_model = YOLO(MODEL_PATH)
    return _yolo_model


def get_growth_models():
    global _growth_model, _label_encoder
    if _growth_model is None or _label_encoder is None:
        if not os.path.exists(GROWTH_MODEL_PATH):
            raise FileNotFoundError(f"Growth model not found: {GROWTH_MODEL_PATH}")
        if not os.path.exists(ENCODER_PATH):
            raise FileNotFoundError(f"Label encoder not found: {ENCODER_PATH}")
        _growth_model = joblib.load(GROWTH_MODEL_PATH)
        _label_encoder = joblib.load(ENCODER_PATH)
    return _growth_model, _label_encoder


# ============================================================
# MAIN PIPELINE FUNCTION (FOR FASTAPI AND EXTERNAL CALLS)
# ============================================================

def predict_single_leaf(image_input, leaf_count: int, output_overlay_path: str = None):
    """
    Runs the complete inference pipeline on a single leaf image.

    Parameters
    ----------
    image_input : str or np.ndarray
        Path to image file or OpenCV BGR image array.
    leaf_count : int
        Manual leaf count provided by user / frontend.
    output_overlay_path : str, optional
        Path to save annotated overlay image.

    Returns
    -------
    dict:
        {
            "opencv_leaf_length_cm": float,
            "opencv_leaf_width_cm": float,
            "opencv_leaf_area_cm2": float,
            "leaf_count": int,
            "growth_stage": str,
            "confidence": float,
            "pixels_per_cm": float,
            "calibration_source": str
        }
    """
    model = get_yolo_model()
    growth_model, encoder = get_growth_models()

    if isinstance(image_input, str):
        if not os.path.exists(image_input):
            raise FileNotFoundError(f"Image not found: {image_input}")
        image = cv2.imread(image_input)
        if image is None:
            raise ValueError(f"Could not read image: {image_input}")
        image_path_str = image_input
    else:
        image = image_input
        image_path_str = "uploaded_image.jpg"

    results = model(image_input, conf=CONF_THRESHOLD)

    detected_leaves = []
    detected_coins = []

    for result in results:
        if result.masks is None:
            continue

        masks = result.masks.data.cpu().numpy()
        classes = result.boxes.cls.cpu().numpy()
        confidences = result.boxes.conf.cpu().numpy()

        for mask, cls, confidence in zip(masks, classes, confidences):
            class_id = int(cls)
            confidence = float(confidence)

            mask = cv2.resize(
                mask,
                (result.orig_shape[1], result.orig_shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )
            binary_mask = (mask > 0.5).astype(np.uint8)
            pixel_area = cv2.countNonZero(binary_mask)
            if pixel_area == 0:
                continue

            if class_id == COIN_CLASS:
                detected_coins.append({"mask": binary_mask, "area": pixel_area, "confidence": confidence})
            elif class_id == LEAF_CLASS:
                detected_leaves.append({"mask": binary_mask, "area": pixel_area, "confidence": confidence})

    # Coin calibration
    if len(detected_coins) > 0:
        largest_coin = max(detected_coins, key=lambda x: x["area"])
        coin_area_pixels = largest_coin["area"]
        coin_diameter_pixels = np.sqrt((4 * coin_area_pixels) / np.pi)
        pixels_per_cm = coin_diameter_pixels / COIN_DIAMETER_CM
        calibration_source = "coin"
    else:
        pixels_per_cm = PIXELS_PER_CM_FIXED
        calibration_source = "fixed"

    if len(detected_leaves) == 0:
        raise ValueError("No leaf detected in the image.")

    largest_leaf = max(detected_leaves, key=lambda x: x["area"])
    largest_leaf_mask = largest_leaf["mask"]
    largest_leaf_pixels = largest_leaf["area"]

    opencv_leaf_area_cm2 = largest_leaf_pixels / (pixels_per_cm ** 2)

    contours, _ = cv2.findContours(largest_leaf_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    opencv_length_cm = np.nan
    opencv_width_cm = np.nan
    skeleton = None
    rect = None
    largest_contour = None
    tip_point = None
    base_point = None

    if len(contours) > 0:
        largest_contour = max(contours, key=cv2.contourArea)
        opencv_width_cm, rect = calculate_leaf_width(largest_contour, pixels_per_cm)
        (
            opencv_length_cm,
            length_pixels,
            tip_point,
            base_point,
            _contour_ret,
            skeleton,
        ) = calculate_leaf_length_v3(largest_leaf_mask, pixels_per_cm)

    if np.isnan(opencv_length_cm) or np.isnan(opencv_width_cm):
        raise ValueError("Could not measure leaf length or width from image segmentation.")

    input_data = pd.DataFrame({
        "opencv_leaf_length_cm": [opencv_length_cm],
        "opencv_leaf_width_cm": [opencv_width_cm],
        "opencv_leaf_area_cm2": [opencv_leaf_area_cm2],
        "leaf_count": [leaf_count],
    })

    prediction = growth_model.predict(input_data)[0]
    probabilities = growth_model.predict_proba(input_data)[0]
    growth_stage = encoder.inverse_transform([prediction])[0]
    confidence = float(np.max(probabilities) * 100)

    if output_overlay_path:
        overlay = image.copy()
        if largest_contour is not None:
            cv2.drawContours(overlay, [largest_contour], -1, (0, 255, 0), 3)
        if rect is not None:
            box = cv2.boxPoints(rect)
            box = np.int32(box)
            cv2.drawContours(overlay, [box], 0, (255, 0, 0), 2)
        if tip_point is not None and base_point is not None:
            cv2.circle(overlay, tip_point, 8, (0, 255, 0), -1)
            cv2.circle(overlay, base_point, 8, (0, 0, 255), -1)
            cv2.line(overlay, tip_point, base_point, (255, 0, 0), 3)

        cv2.putText(overlay, f"Length: {opencv_length_cm:.2f} cm", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        cv2.putText(overlay, f"Width: {opencv_width_cm:.2f} cm", (20, 75),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        cv2.putText(overlay, f"Area: {opencv_leaf_area_cm2:.2f} cm2", (20, 110),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        cv2.putText(overlay, f"Leaf Count: {leaf_count}", (20, 145),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        cv2.putText(overlay, f"Calibration: {calibration_source}", (20, 180),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 0), 2)
        cv2.putText(overlay, f"Growth: {growth_stage}", (20, 215),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(overlay, f"Confidence: {confidence:.2f}%", (20, 250),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imwrite(output_overlay_path, overlay)

    return {
        "opencv_leaf_length_cm": float(opencv_length_cm),
        "opencv_leaf_width_cm": float(opencv_width_cm),
        "opencv_leaf_area_cm2": float(opencv_leaf_area_cm2),
        "leaf_count": int(leaf_count),
        "growth_stage": str(growth_stage),
        "confidence": float(confidence),
        "pixels_per_cm": float(pixels_per_cm),
        "calibration_source": str(calibration_source),
    }


# ============================================================
# CLI SCRIPT EXECUTION
# ============================================================

if __name__ == "__main__":
    print()
    print("=" * 65)
    print("RUNNING SINGLE IMAGE TEST")
    print("=" * 65)
    print("Image:", NEW_IMAGE_PATH)

    while True:
        try:
            leaf_cnt = int(input("Enter manual leaf count: "))
            if leaf_cnt <= 0:
                print("Leaf count must be > 0.")
                continue
            break
        except ValueError:
            print("Please enter a whole number.")

    res = predict_single_leaf(NEW_IMAGE_PATH, leaf_cnt, output_overlay_path=OUTPUT_OVERLAY)

    print()
    print("=" * 65)
    print("OPENCV MEASUREMENTS & PREDICTION RESULTS")
    print("=" * 65)
    print("Calibration: ", res["calibration_source"])
    print(f"Length:      {res['opencv_leaf_length_cm']:.2f} cm")
    print(f"Width:       {res['opencv_leaf_width_cm']:.2f} cm")
    print(f"Area:        {res['opencv_leaf_area_cm2']:.2f} cm2")
    print(f"Leaf Count:  {res['leaf_count']}")
    print(f"Growth Stage:{res['growth_stage']}")
    print(f"Confidence:  {res['confidence']:.2f}%")
    print("Overlay:     ", OUTPUT_OVERLAY)
    print("=" * 65)