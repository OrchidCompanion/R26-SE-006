from ultralytics import YOLO
import pandas as pd
import os
import cv2
import numpy as np
from skimage.morphology import skeletonize
from heapq import heappush, heappop


# ============================================================
# SETTINGS
# ============================================================

MODEL_PATH = "best.pt"

IMAGE_FOLDER = "photos"

INPUT_EXCEL = "leaf_area_results.xlsx"

OUTPUT_EXCEL = "leaf_area_results_v1.xlsx"

MASK_FOLDER = "masks_v1"

OVERLAY_FOLDER = "overlays_v1"


# ============================================================
# COIN CALIBRATION
# ============================================================

# Physical diameter of your reference coin.
#
# IMPORTANT:
# Confirm this matches the actual coin you used.
#
# 5-rupee coin assumed here = 2.5 cm

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
# CREATE FOLDERS
# ============================================================

os.makedirs(
    MASK_FOLDER,
    exist_ok=True
)

os.makedirs(
    OVERLAY_FOLDER,
    exist_ok=True
)


# ============================================================
# LOAD YOLO
# ============================================================

print()
print("=" * 65)
print("LOADING YOLO MODEL")
print("=" * 65)

model = YOLO(MODEL_PATH)

print(
    "Classes:",
    model.names
)


# ============================================================
# LOAD EXCEL
# ============================================================

print()
print("Loading Excel:")
print(INPUT_EXCEL)

df = pd.read_excel(
    INPUT_EXCEL
)

df.columns = df.columns.str.strip()


# ============================================================
# REQUIRED COLUMNS
# ============================================================

required_columns = [
    "image_name",
    "leaf_length_cm",
    "leaf_width_cm",
    "leaf_count"
]

for column in required_columns:

    if column not in df.columns:

        raise ValueError(
            f"\nMissing required column: {column}\n"
            f"Available columns:\n{df.columns.tolist()}"
        )


# ============================================================
# IMPORTANT
#
# DO NOT MODIFY THESE:
#
# leaf_length_cm
# leaf_width_cm
# leaf_count
#
# If leaf_area_cm2 already exists, it is also preserved.
# ============================================================


# ============================================================
# CREATE OPENCV COLUMNS
# ============================================================

# Numeric columns

numeric_columns = [
    "opencv_leaf_length_cm",
    "opencv_leaf_width_cm",
    "opencv_leaf_area_cm2",
    "opencv_pixels_per_cm",
    "true_leaf_length_cm",
    "true_leaf_width_cm",
    "length_diff_cm",
    "width_diff_cm",
    "length_error_percent",
    "width_error_percent"
]


for column in numeric_columns:

    if column not in df.columns:

        df[column] = np.nan

    else:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )


    # Force float dtype

    df[column] = df[column].astype(float)


# ============================================================
# CALIBRATION COLUMN
# ============================================================

# VERY IMPORTANT:
#
# This must be a STRING column because it will contain:
#
# "coin"
# "fixed"

if "opencv_calibration" not in df.columns:

    df["opencv_calibration"] = ""


df["opencv_calibration"] = (
    df["opencv_calibration"]
    .fillna("")
    .astype(str)
)


# ============================================================
# FUNCTION:
# SKELETONIZE
# ============================================================

def skeletonize_mask(binary_mask):

    """
    Convert the leaf mask into a skeleton.

    The skeleton provides a centerline of the leaf,
    which is useful for estimating leaf length.
    """

    mask = np.where(
        binary_mask > 0,
        255,
        0
    ).astype(np.uint8)


    # --------------------------------------------------------
    # Try OpenCV thinning
    # --------------------------------------------------------

    if hasattr(cv2, "ximgproc"):

        try:

            skeleton = cv2.ximgproc.thinning(
                mask
            )

            return skeleton

        except Exception:

            pass


    # --------------------------------------------------------
    # Morphological skeleton fallback
    # --------------------------------------------------------

    skeleton = np.zeros_like(
        mask
    )

    current = mask.copy()


    kernel = cv2.getStructuringElement(
        cv2.MORPH_CROSS,
        (3, 3)
    )


    while True:

        eroded = cv2.erode(
            current,
            kernel
        )

        opened = cv2.dilate(
            eroded,
            kernel
        )

        difference = cv2.subtract(
            current,
            opened
        )

        skeleton = cv2.bitwise_or(
            skeleton,
            difference
        )

        current = eroded


        if cv2.countNonZero(
            current
        ) == 0:

            break


    return skeleton


# ============================================================
# FUNCTION:
# SKELETON PATH LENGTH
# ============================================================

def skeleton_path_length(
    skeleton,
    start,
    end
):

    """
    Calculate the path length between two skeleton points.
    """

    height, width = skeleton.shape


    directions = [

        (-1, -1, np.sqrt(2)),
        (-1,  0, 1.0),
        (-1,  1, np.sqrt(2)),

        (0, -1, 1.0),
        (0,  1, 1.0),

        (1, -1, np.sqrt(2)),
        (1,  0, 1.0),
        (1,  1, np.sqrt(2))

    ]


    start = tuple(start)

    end = tuple(end)


    distances = {
        start: 0
    }


    heap = []

    heappush(
        heap,
        (0, start)
    )


    visited = set()


    while heap:

        current_distance, current = heappop(
            heap
        )


        if current in visited:

            continue


        visited.add(
            current
        )


        if current == end:

            return current_distance


        y, x = current


        for dy, dx, cost in directions:

            ny = y + dy
            nx = x + dx


            if ny < 0 or ny >= height:
                continue

            if nx < 0 or nx >= width:
                continue


            if skeleton[ny, nx] == 0:

                continue


            neighbor = (
                ny,
                nx
            )


            new_distance = (
                current_distance
                +
                cost
            )


            if (
                neighbor not in distances
                or
                new_distance < distances[neighbor]
            ):

                distances[neighbor] = (
                    new_distance
                )


                heappush(
                    heap,
                    (
                        new_distance,
                        neighbor
                    )
                )


    return None


# ============================================================
# FUNCTION:
# CALCULATE LEAF LENGTH
# ============================================================

def calculate_leaf_length(
    leaf_mask,
    pixels_per_cm
):

    """
    Calculate length using the skeleton of the leaf.
    """

    skeleton = skeletonize_mask(
        leaf_mask
    )


    ys, xs = np.where(
        skeleton > 0
    )


    if len(xs) < 2:

        return np.nan, skeleton


    # --------------------------------------------------------
    # Find endpoints
    # --------------------------------------------------------

    skeleton_binary = (
        skeleton > 0
    ).astype(np.uint8)


    padded = np.pad(
        skeleton_binary,
        1,
        mode="constant"
    )


    endpoints = []


    for y, x in zip(
        ys,
        xs
    ):

        yy = y + 1
        xx = x + 1


        neighborhood = padded[
            yy - 1:yy + 2,
            xx - 1:xx + 2
        ]


        neighbors = (
            np.sum(neighborhood) - 1
        )


        if neighbors == 1:

            endpoints.append(
                (y, x)
            )


    # --------------------------------------------------------
    # Find longest endpoint pair
    # --------------------------------------------------------

    if len(endpoints) >= 2:

        max_distance = 0

        best_pair = None


        for i in range(
            len(endpoints)
        ):

            for j in range(
                i + 1,
                len(endpoints)
            ):

                y1, x1 = endpoints[i]

                y2, x2 = endpoints[j]


                distance = np.sqrt(

                    (x2 - x1) ** 2
                    +
                    (y2 - y1) ** 2

                )


                if distance > max_distance:

                    max_distance = distance

                    best_pair = (
                        endpoints[i],
                        endpoints[j]
                    )


        # ----------------------------------------------------
        # Calculate path distance
        # ----------------------------------------------------

        if best_pair is not None:

            path_pixels = skeleton_path_length(

                skeleton_binary,

                best_pair[0],

                best_pair[1]

            )


            if path_pixels is not None:

                length_cm = (

                    path_pixels
                    /
                    pixels_per_cm

                )


                return (
                    length_cm,
                    skeleton
                )


    # --------------------------------------------------------
    # Fallback:
    # maximum distance between skeleton pixels
    # --------------------------------------------------------

    points = np.column_stack(
        (xs, ys)
    )


    # Avoid excessive computation

    if len(points) > 1500:

        indices = np.linspace(

            0,

            len(points) - 1,

            1500

        ).astype(int)


        points = points[
            indices
        ]


    max_distance = 0


    for i in range(
        len(points)
    ):

        dx = (
            points[:, 0]
            -
            points[i, 0]
        )


        dy = (
            points[:, 1]
            -
            points[i, 1]
        )


        distances = np.sqrt(

            dx ** 2
            +
            dy ** 2

        )


        current_max = distances.max()


        if current_max > max_distance:

            max_distance = current_max


    length_cm = (

        max_distance
        /
        pixels_per_cm

    )


    return (
        length_cm,
        skeleton
    )



def calculate_leaf_length_v2(
    leaf_mask,
    pixels_per_cm
):
    """
    Calculate Dendrobium leaf length using straight-line
    TIP-to-BASE distance.

    Definition:
        Leaf length = straight-line distance between the
        two biological ends of the leaf.

    Parameters
    ----------
    leaf_mask : numpy.ndarray
        Binary YOLO segmentation mask.
        Non-zero pixels represent the leaf.

    pixels_per_cm : float
        Per-image calibration factor:
            pixels_per_cm = coin_diameter_pixels / known_coin_diameter_cm

    Returns
    -------
    length_cm : float
        Leaf length in centimeters.

    length_pixels : float
        Leaf length in pixels.

    tip_point : tuple
        Detected leaf tip (x, y).

    base_point : tuple
        Detected leaf base (x, y).

    contour : numpy.ndarray
        Largest leaf contour.

    skeleton : numpy.ndarray
        Leaf skeleton.
    """

    # ==========================================================
    # 1. VALIDATION
    # ==========================================================

    if leaf_mask is None:
        return np.nan, np.nan, None, None, None, None

    if pixels_per_cm is None or pixels_per_cm <= 0:
        return np.nan, np.nan, None, None, None, None

    # ==========================================================
    # 2. PREPARE MASK
    # ==========================================================

    mask = np.asarray(leaf_mask)

    if mask.ndim > 2:
        mask = np.squeeze(mask)

    mask = (mask > 0).astype(np.uint8) * 255

    # Remove small segmentation noise
    kernel = np.ones((3, 3), np.uint8)

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        kernel
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel
    )

    # ==========================================================
    # 3. FIND LARGEST LEAF CONTOUR
    # ==========================================================

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_NONE
    )

    if not contours:
        return np.nan, np.nan, None, None, None, None

    contour = max(
        contours,
        key=cv2.contourArea
    )

    if cv2.contourArea(contour) < 100:
        return np.nan, np.nan, None, None, None, None

    # ==========================================================
    # 4. CREATE CLEAN LEAF MASK
    # ==========================================================

    clean_mask = np.zeros_like(mask)

    cv2.drawContours(
        clean_mask,
        [contour],
        -1,
        255,
        thickness=cv2.FILLED
    )

    # ==========================================================
    # 5. SKELETONIZE
    # ==========================================================

    skeleton = skeletonize(
        clean_mask > 0
    ).astype(np.uint8)

    ys, xs = np.where(
        skeleton > 0
    )

    if len(xs) < 10:
        return np.nan, np.nan, None, None, contour, skeleton

    # ==========================================================
    # 6. FIND SKELETON ENDPOINTS
    # ==========================================================

    skeleton_padded = np.pad(
        skeleton,
        1,
        mode="constant"
    )

    endpoints = []

    for y, x in zip(ys, xs):

        yy = y + 1
        xx = x + 1

        neighborhood = skeleton_padded[
            yy - 1:yy + 2,
            xx - 1:xx + 2
        ]

        neighbors = (
            np.sum(neighborhood) - 1
        )

        # One neighboring skeleton pixel
        if neighbors == 1:

            endpoints.append(
                (x, y)
            )

    # ==========================================================
    # 7. FALLBACK IF ENDPOINTS ARE NOT FOUND
    # ==========================================================

    if len(endpoints) < 2:

        points = contour.reshape(
            -1,
            2
        ).astype(np.float32)

        mean = np.mean(
            points,
            axis=0
        )

        centered = points - mean

        covariance = np.cov(
            centered.T
        )

        eigenvalues, eigenvectors = np.linalg.eigh(
            covariance
        )

        major_axis = eigenvectors[
            :,
            np.argmax(eigenvalues)
        ]

        projections = (
            centered @ major_axis
        )

        p1 = points[
            np.argmin(projections)
        ]

        p2 = points[
            np.argmax(projections)
        ]

        length_pixels = np.linalg.norm(
            p2 - p1
        )

        length_cm = (
            length_pixels /
            pixels_per_cm
        )

        p1 = (
            int(round(p1[0])),
            int(round(p1[1]))
        )

        p2 = (
            int(round(p2[0])),
            int(round(p2[1]))
        )

        return (
            float(length_cm),
            float(length_pixels),
            p1,
            p2,
            contour,
            skeleton
        )

    # ==========================================================
    # 8. FIND THE TWO MOST DISTANT ENDPOINTS
    #
    # This prevents small branches/noise from being selected.
    # ==========================================================

    max_distance = -1

    best_pair = None

    for i in range(
        len(endpoints)
    ):

        for j in range(
            i + 1,
            len(endpoints)
        ):

            p1 = np.array(
                endpoints[i],
                dtype=np.float32
            )

            p2 = np.array(
                endpoints[j],
                dtype=np.float32
            )

            distance = np.linalg.norm(
                p2 - p1
            )

            if distance > max_distance:

                max_distance = distance

                best_pair = (
                    endpoints[i],
                    endpoints[j]
                )

    if best_pair is None:
        return np.nan, np.nan, None, None, contour, skeleton

    endpoint_a = np.array(
        best_pair[0],
        dtype=np.float32
    )

    endpoint_b = np.array(
        best_pair[1],
        dtype=np.float32
    )

    # ==========================================================
    # 9. REFINE ENDPOINTS TO LEAF CONTOUR
    #
    # Skeleton endpoints are inside the leaf.
    #
    # Move each endpoint toward the closest contour point.
    # ==========================================================

    contour_points = contour.reshape(
        -1,
        2
    ).astype(np.float32)

    distances_a = np.linalg.norm(
        contour_points - endpoint_a,
        axis=1
    )

    distances_b = np.linalg.norm(
        contour_points - endpoint_b,
        axis=1
    )

    contour_point_a = contour_points[
        np.argmin(distances_a)
    ]

    contour_point_b = contour_points[
        np.argmin(distances_b)
    ]

    # ==========================================================
    # 10. CALCULATE STRAIGHT-LINE TIP-TO-BASE DISTANCE
    # ==========================================================

    dx = (
        contour_point_b[0]
        -
        contour_point_a[0]
    )

    dy = (
        contour_point_b[1]
        -
        contour_point_a[1]
    )

    length_pixels = np.sqrt(
        dx ** 2 +
        dy ** 2
    )

    # ==========================================================
    # 11. PIXELS -> CM
    # ==========================================================

    length_cm = (
        length_pixels /
        pixels_per_cm
    )

    # ==========================================================
    # 12. CONVERT POINTS TO INTEGER COORDINATES
    # ==========================================================

    point_a = (
        int(round(contour_point_a[0])),
        int(round(contour_point_a[1]))
    )

    point_b = (
        int(round(contour_point_b[0])),
        int(round(contour_point_b[1]))
    )

    # ==========================================================
    # 13. RETURN
    # ==========================================================

    return (
        float(length_cm),
        float(length_pixels),
        point_a,
        point_b,
        contour,
        skeleton
    )



def calculate_leaf_length_v3(
    leaf_mask,
    pixels_per_cm
):
    """
    Calculate Dendrobium leaf length using
    tip-to-base straight-line distance.

    TIP:
        Existing shape-based tip detection is retained.

    BASE:
        The basal region is identified using the leaf's
        major axis, and the base point is estimated from
        the center of that basal region.

    Final length:
        Straight-line distance between tip and base.

    Returns
    -------
    length_cm
    length_pixels
    tip_point
    base_point
    contour
    skeleton
    """

    # =========================================================
    # 1. VALIDATION
    # =========================================================

    if leaf_mask is None:
        return (
            np.nan,
            np.nan,
            None,
            None,
            None,
            None
        )

    if pixels_per_cm is None:
        return (
            np.nan,
            np.nan,
            None,
            None,
            None,
            None
        )

    if pixels_per_cm <= 0:
        return (
            np.nan,
            np.nan,
            None,
            None,
            None,
            None
        )

    # =========================================================
    # 2. PREPARE MASK
    # =========================================================

    mask = np.asarray(
        leaf_mask
    )

    if mask.ndim > 2:
        mask = np.squeeze(mask)

    mask = (
        mask > 0
    ).astype(
        np.uint8
    ) * 255

    # Remove small segmentation noise
    kernel = np.ones(
        (3, 3),
        np.uint8
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        kernel
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel
    )

    # =========================================================
    # 3. CREATE SKELETON
    #
    # Skeleton is used only to identify the two ends.
    # It is NOT used for the final length measurement.
    # =========================================================

    skeleton = skeletonize_mask(
        mask
    )

    skeleton_binary = (
        skeleton > 0
    ).astype(
        np.uint8
    )

    # =========================================================
    # 4. FIND LEAF CONTOUR
    # =========================================================

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_NONE
    )

    if len(contours) == 0:
        return (
            np.nan,
            np.nan,
            None,
            None,
            None,
            skeleton
        )

    # Select largest contour
    contour = max(
        contours,
        key=cv2.contourArea
    )

    if cv2.contourArea(
        contour
    ) < 100:
        return (
            np.nan,
            np.nan,
            None,
            None,
            contour,
            skeleton
        )

    # =========================================================
    # 5. GET CONTOUR POINTS
    # =========================================================

    points = contour.reshape(
        -1,
        2
    ).astype(
        np.float32
    )

    if len(points) < 10:
        return (
            np.nan,
            np.nan,
            None,
            None,
            contour,
            skeleton
        )

    # =========================================================
    # 6. PCA
    #
    # Determine the longitudinal direction of the leaf.
    # =========================================================

    mean = np.mean(
        points,
        axis=0
    )

    centered = (
        points - mean
    )

    covariance = np.cov(
        centered.T
    )

    eigenvalues, eigenvectors = np.linalg.eigh(
        covariance
    )

    major_axis = eigenvectors[
        :,
        np.argmax(eigenvalues)
    ]

    major_axis = (
        major_axis /
        np.linalg.norm(
            major_axis
        )
    )

    # =========================================================
    # 7. PERPENDICULAR AXIS
    # =========================================================

    perpendicular_axis = np.array(
        [
            -major_axis[1],
            major_axis[0]
        ],
        dtype=np.float32
    )

    # =========================================================
    # 8. PROJECT CONTOUR ONTO MAJOR AXIS
    # =========================================================

    longitudinal = (
        centered @ major_axis
    )

    transverse = (
        centered @ perpendicular_axis
    )

    min_longitudinal = np.min(
        longitudinal
    )

    max_longitudinal = np.max(
        longitudinal
    )

    total_length_axis = (
        max_longitudinal -
        min_longitudinal
    )

    if total_length_axis <= 0:
        return (
            np.nan,
            np.nan,
            None,
            None,
            contour,
            skeleton
        )

    # =========================================================
    # 9. FIND SKELETON ENDPOINTS
    #
    # These are used only to help identify which side
    # corresponds to the leaf base.
    # =========================================================

    ys, xs = np.where(
        skeleton_binary > 0
    )

    skeleton_padded = np.pad(
        skeleton_binary,
        1,
        mode="constant"
    )

    endpoints = []

    for y, x in zip(
        ys,
        xs
    ):

        yy = y + 1
        xx = x + 1

        neighborhood = skeleton_padded[
            yy - 1:yy + 2,
            xx - 1:xx + 2
        ]

        neighbors = (
            np.sum(neighborhood) - 1
        )

        if neighbors == 1:

            endpoints.append(
                (x, y)
            )

    # =========================================================
    # 10. FIND THE TWO MOST DISTANT SKELETON ENDPOINTS
    # =========================================================

    best_pair = None
    max_distance = -1

    if len(endpoints) >= 2:

        for i in range(
            len(endpoints)
        ):

            for j in range(
                i + 1,
                len(endpoints)
            ):

                p1 = np.array(
                    endpoints[i],
                    dtype=np.float32
                )

                p2 = np.array(
                    endpoints[j],
                    dtype=np.float32
                )

                distance = np.linalg.norm(
                    p2 - p1
                )

                if distance > max_distance:

                    max_distance = distance

                    best_pair = (
                        endpoints[i],
                        endpoints[j]
                    )

    # =========================================================
    # 11. DETERMINE WHICH SKELETON END IS BASE
    #
    # If skeleton endpoints are available, use them to
    # identify the base side.
    #
    # Otherwise use the wider end of the leaf.
    # =========================================================

    if best_pair is not None:

        endpoint_a = np.array(
            best_pair[0],
            dtype=np.float32
        )

        endpoint_b = np.array(
            best_pair[1],
            dtype=np.float32
        )

        endpoint_a_projection = (
            endpoint_a - mean
        ) @ major_axis

        endpoint_b_projection = (
            endpoint_b - mean
        ) @ major_axis

    else:

        endpoint_a = None
        endpoint_b = None

    # =========================================================
    # 12. DETERMINE WIDTH OF BOTH ENDS
    #
    # This is used to determine the narrower tip end
    # and wider base end.
    # =========================================================

    section_size = (
        total_length_axis * 0.08
    )

    section_size = max(
        section_size,
        5.0
    )

    # ---------------------------------------------------------
    # Left end
    # ---------------------------------------------------------

    left_mask = (
        longitudinal <=
        min_longitudinal +
        section_size
    )

    left_points = points[
        left_mask
    ]

    # ---------------------------------------------------------
    # Right end
    # ---------------------------------------------------------

    right_mask = (
        longitudinal >=
        max_longitudinal -
        section_size
    )

    right_points = points[
        right_mask
    ]

    if (
        len(left_points) < 3 or
        len(right_points) < 3
    ):

        return (
            np.nan,
            np.nan,
            None,
            None,
            contour,
            skeleton
        )

    left_transverse = (
        left_points - mean
    ) @ perpendicular_axis

    right_transverse = (
        right_points - mean
    ) @ perpendicular_axis

    left_width = (
        np.max(left_transverse) -
        np.min(left_transverse)
    )

    right_width = (
        np.max(right_transverse) -
        np.min(right_transverse)
    )

    # =========================================================
    # 13. DETERMINE TIP SIDE
    #
    # IMPORTANT:
    # This is the same tip logic you were already using.
    # =========================================================

    if left_width < right_width:

        tip_side = "left"
        base_side = "right"

    else:

        tip_side = "right"
        base_side = "left"

    # =========================================================
    # 14. FIND TIP REGION
    #
    # TIP LOGIC IS KEPT THE SAME.
    # =========================================================

    tip_section_size = (
        total_length_axis * 0.04
    )

    tip_section_size = max(
        tip_section_size,
        3.0
    )

    if tip_side == "left":

        tip_region_mask = (
            longitudinal <=
            min_longitudinal +
            tip_section_size
        )

        tip_region_points = points[
            tip_region_mask
        ]

    else:

        tip_region_mask = (
            longitudinal >=
            max_longitudinal -
            tip_section_size
        )

        tip_region_points = points[
            tip_region_mask
        ]

    # =========================================================
    # 15. DETERMINE TIP POINT
    # =========================================================

    if len(tip_region_points) == 0:

        # Fallback to extreme contour point

        if tip_side == "left":

            tip_index = np.argmin(
                longitudinal
            )

        else:

            tip_index = np.argmax(
                longitudinal
            )

        tip_point = points[
            tip_index
        ]

    else:

        tip_longitudinal = (
            tip_region_points @ major_axis
        )

        if tip_side == "left":

            tip_index = np.argmin(
                tip_longitudinal
            )

        else:

            tip_index = np.argmax(
                tip_longitudinal
            )

        tip_point = tip_region_points[
            tip_index
        ]

    # =========================================================
    # 16. FIND BASE REGION
    #
    # THIS IS THE MAIN CHANGE.
    #
    # We do NOT simply select the contour pixel closest
    # to the skeleton endpoint.
    #
    # Instead, take the basal 10% of the leaf and estimate
    # the centre of that region.
    # =========================================================

    base_section_size = (
        total_length_axis * 0.10
    )

    base_section_size = max(
        base_section_size,
        5.0
    )

    if base_side == "left":

        base_region_mask = (
            longitudinal <=
            min_longitudinal +
            base_section_size
        )

    else:

        base_region_mask = (
            longitudinal >=
            max_longitudinal -
            base_section_size
        )

    base_region_points = points[
        base_region_mask
    ]

    # =========================================================
    # 17. CALCULATE BASE CENTER
    # =========================================================

    if len(base_region_points) >= 3:

        # -----------------------------------------------------
        # Calculate the centre of the basal region.
        #
        # Median is used instead of mean because it is
        # less affected by irregular contour points.
        # -----------------------------------------------------

        base_center_x = np.median(
            base_region_points[:, 0]
        )

        base_center_y = np.median(
            base_region_points[:, 1]
        )

        base_center = np.array(
            [
                base_center_x,
                base_center_y
            ],
            dtype=np.float32
        )

        # -----------------------------------------------------
        # Find contour point closest to this centre.
        # -----------------------------------------------------

        base_distances = np.linalg.norm(
            base_region_points -
            base_center,
            axis=1
        )

        base_index = np.argmin(
            base_distances
        )

        base_point = base_region_points[
            base_index
        ]

    else:

        # =====================================================
        # FALLBACK
        # =====================================================

        if endpoint_b is not None:

            # Use the skeleton endpoint only as fallback

            endpoint_projection = (
                endpoint_b - mean
            ) @ major_axis

            if base_side == "left":

                if endpoint_a_projection < endpoint_b_projection:

                    base_point = endpoint_a

                else:

                    base_point = endpoint_b

            else:

                if endpoint_a_projection > endpoint_b_projection:

                    base_point = endpoint_a

                else:

                    base_point = endpoint_b

        else:

            # Final fallback:
            # use the centre of the basal contour region

            if base_side == "left":

                base_index = np.argmin(
                    longitudinal
                )

            else:

                base_index = np.argmax(
                    longitudinal
                )

            base_point = points[
                base_index
            ]

    # =========================================================
    # 18. FINAL TIP-TO-BASE DISTANCE
    #
    # IMPORTANT:
    # This is straight-line distance.
    # =========================================================

    dx = (
        base_point[0] -
        tip_point[0]
    )

    dy = (
        base_point[1] -
        tip_point[1]
    )

    length_pixels = np.sqrt(
        dx ** 2 +
        dy ** 2
    )

    # =========================================================
    # 19. PIXELS -> CM
    # =========================================================

    length_cm = (
        length_pixels /
        pixels_per_cm
    )

    # =========================================================
    # 20. CONVERT POINTS TO INTEGER COORDINATES
    # =========================================================

    tip_point = (
        int(round(tip_point[0])),
        int(round(tip_point[1]))
    )

    base_point = (
        int(round(base_point[0])),
        int(round(base_point[1]))
    )

    # =========================================================
    # 21. RETURN
    # =========================================================

    return (
        float(length_cm),
        float(length_pixels),
        tip_point,
        base_point,
        contour,
        skeleton
    )
# ============================================================
# FUNCTION:
# CALCULATE LEAF WIDTH
# ============================================================

def calculate_leaf_width(
    contour,
    pixels_per_cm
):

    """
    Width is the shorter side of the minimum-area
    rotated rectangle around the largest leaf.
    """

    rect = cv2.minAreaRect(
        contour
    )


    width_pixels = min(

        rect[1][0],

        rect[1][1]

    )


    width_cm = (

        width_pixels
        /
        pixels_per_cm

    )


    return (
        width_cm,
        rect
    )


# ============================================================
# PROCESS EACH IMAGE
# ============================================================

for index, row in df.iterrows():


    # ========================================================
    # IMAGE NAME
    # ========================================================

    image_name = str(
        row["image_name"]
    ).strip()


    image_path = os.path.join(

        IMAGE_FOLDER,

        image_name

    )


    if not os.path.exists(
        image_path
    ):

        print()
        print(
            "IMAGE NOT FOUND:",
            image_path
        )

        continue


    print()
    print("=" * 65)
    print(
        "Processing:",
        image_name
    )
    print("=" * 65)


    # ========================================================
    # READ IMAGE
    # ========================================================

    image = cv2.imread(
        image_path
    )


    if image is None:

        print(
            "Could not read image."
        )

        continue


    # ========================================================
    # YOLO
    # ========================================================

    results = model(

        image_path,

        conf=CONF_THRESHOLD

    )


    detected_leaves = []

    detected_coins = []


    # ========================================================
    # PROCESS DETECTIONS
    # ========================================================

    for result in results:


        if result.masks is None:

            print(
                "No segmentation masks."
            )

            continue


        masks = (
            result.masks.data
            .cpu()
            .numpy()
        )


        classes = (
            result.boxes.cls
            .cpu()
            .numpy()
        )


        confidences = (
            result.boxes.conf
            .cpu()
            .numpy()
        )


        for mask, cls, confidence in zip(

            masks,

            classes,

            confidences

        ):


            class_id = int(
                cls
            )


            confidence = float(
                confidence
            )


            print(
                f"Detection: "
                f"class={class_id}, "
                f"name={model.names.get(class_id)}, "
                f"confidence={confidence:.3f}"
            )


            # ------------------------------------------------
            # Resize mask
            # ------------------------------------------------

            mask = cv2.resize(

                mask,

                (
                    result.orig_shape[1],
                    result.orig_shape[0]
                ),

                interpolation=cv2.INTER_NEAREST

            )


            binary_mask = (

                mask > 0.5

            ).astype(
                np.uint8
            )


            pixel_area = cv2.countNonZero(
                binary_mask
            )


            if pixel_area == 0:

                continue


            # =================================================
            # COIN
            # =================================================

            if class_id == COIN_CLASS:

                detected_coins.append({

                    "mask":
                        binary_mask,

                    "area":
                        pixel_area,

                    "confidence":
                        confidence

                })


            # =================================================
            # LEAF
            # =================================================

            elif class_id == LEAF_CLASS:

                detected_leaves.append({

                    "mask":
                        binary_mask,

                    "area":
                        pixel_area,

                    "confidence":
                        confidence

                })


    # ========================================================
    # DETECTION SUMMARY
    # ========================================================

    print()
    print(
        "Detected leaves:",
        len(detected_leaves)
    )

    print(
        "Detected coins:",
        len(detected_coins)
    )


    # ========================================================
    # COIN CALIBRATION
    # ========================================================

    if len(detected_coins) > 0:


        # ----------------------------------------------------
        # Select largest detected coin
        # ----------------------------------------------------

        largest_coin = max(

            detected_coins,

            key=lambda x: x["area"]

        )


        coin_area_pixels = (
            largest_coin["area"]
        )


        # ----------------------------------------------------
        # Equivalent circle diameter
        # ----------------------------------------------------

        coin_diameter_pixels = np.sqrt(

            (
                4 *
                coin_area_pixels
            )
            /
            np.pi

        )


        pixels_per_cm = (

            coin_diameter_pixels
            /
            COIN_DIAMETER_CM

        )


        calibration_source = "coin"


        print()
        print(
            "COIN DETECTED"
        )

        print(
            "Coin confidence:",
            round(
                largest_coin["confidence"],
                3
            )
        )

        print(
            "Coin area:",
            coin_area_pixels,
            "pixels"
        )

        print(
            "Coin diameter:",
            round(
                coin_diameter_pixels,
                2
            ),
            "pixels"
        )

        print(
            "Pixels per cm:",
            round(
                pixels_per_cm,
                2
            )
        )


    else:


        # ----------------------------------------------------
        # Fallback
        # ----------------------------------------------------

        pixels_per_cm = (
            PIXELS_PER_CM_FIXED
        )


        calibration_source = "fixed"


        print()
        print(
            "WARNING: COIN NOT DETECTED"
        )

        print(
            "Using fixed calibration:",
            pixels_per_cm,
            "pixels/cm"
        )


    # ========================================================
    # NO LEAF
    # ========================================================

    if len(detected_leaves) == 0:

        print(
            "NO LEAF DETECTED"
        )

        df.at[
            index,
            "opencv_leaf_length_cm"
        ] = np.nan

        df.at[
            index,
            "opencv_leaf_width_cm"
        ] = np.nan

        df.at[
            index,
            "opencv_leaf_area_cm2"
        ] = np.nan

        df.at[
            index,
            "opencv_pixels_per_cm"
        ] = float(
            pixels_per_cm
        )

        df.at[
            index,
            "opencv_calibration"
        ] = str(
            calibration_source
        )

        continue


    # ========================================================
    # SELECT LARGEST LEAF ONLY
    # ========================================================

    largest_leaf = max(

        detected_leaves,

        key=lambda x: x["area"]

    )


    largest_leaf_mask = (
        largest_leaf["mask"]
    )


    largest_leaf_pixels = (
        largest_leaf["area"]
    )


    print()
    print(
        "LARGEST LEAF SELECTED"
    )

    print(
        "Confidence:",
        round(
            largest_leaf["confidence"],
            3
        )
    )

    print(
        "Area in pixels:",
        largest_leaf_pixels
    )


    # ========================================================
    # LEAF AREA
    # ========================================================

    opencv_leaf_area_cm2 = (

        largest_leaf_pixels
        /
        (
            pixels_per_cm ** 2
        )

    )


    # ========================================================
    # FIND CONTOUR
    # ========================================================

    contours, _ = cv2.findContours(

        largest_leaf_mask,

        cv2.RETR_EXTERNAL,

        cv2.CHAIN_APPROX_NONE

    )


    opencv_length_cm = np.nan

    opencv_width_cm = np.nan

    skeleton = None
    rect = None
    largest_contour = None
    point_a = None
    point_b = None

    if len(contours) > 0:
        largest_contour = max(
            contours,
            key=cv2.contourArea
        )

        # ====================================================
        # WIDTH
        # ====================================================

        (
            opencv_width_cm,
            rect
        ) = calculate_leaf_width(
            largest_contour,
            pixels_per_cm
        )

        # ====================================================
        # LENGTH
        # ====================================================

        (
            opencv_length_cm,
            length_pixels,
            point_a,
            point_b,
            contour_ret,
            skeleton
        ) = calculate_leaf_length_v3(
            largest_leaf_mask,
            pixels_per_cm
        )


    # ========================================================
    # SAVE NUMERIC RESULTS
    # ========================================================

    if not np.isnan(
        opencv_length_cm
    ):

        df.at[
            index,
            "opencv_leaf_length_cm"
        ] = float(
            round(
                opencv_length_cm,
                2
            )
        )

    else:

        df.at[
            index,
            "opencv_leaf_length_cm"
        ] = np.nan


    if not np.isnan(
        opencv_width_cm
    ):

        df.at[
            index,
            "opencv_leaf_width_cm"
        ] = float(
            round(
                opencv_width_cm,
                2
            )
        )

    else:

        df.at[
            index,
            "opencv_leaf_width_cm"
        ] = np.nan


    df.at[
        index,
        "opencv_leaf_area_cm2"
    ] = float(
        round(
            opencv_leaf_area_cm2,
            2
        )
    )


    df.at[
        index,
        "opencv_pixels_per_cm"
    ] = float(
        round(
            pixels_per_cm,
            4
        )
    )


    # ========================================================
    # SAVE CALIBRATION AS STRING
    # ========================================================

    df.at[
        index,
        "opencv_calibration"
    ] = str(
        calibration_source
    )


    # ========================================================
    # PRINT RESULTS
    # ========================================================

    print()
    print(
        "OPENCV RESULTS"
    )

    print(
        "Calibration:",
        calibration_source
    )

    print(
        "Pixels/cm:",
        round(
            pixels_per_cm,
            2
        )
    )

    print(
        "Length:",
        round(
            opencv_length_cm,
            2
        ),
        "cm"
    )

    print(
        "Width:",
        round(
            opencv_width_cm,
            2
        ),
        "cm"
    )

    print(
        "Area:",
        round(
            opencv_leaf_area_cm2,
            2
        ),
        "cm²"
    )


    # ========================================================
    # MANUAL VALUES
    # ========================================================

    manual_length = row[
        "leaf_length_cm"
    ]

    manual_width = row[
        "leaf_width_cm"
    ]


    print()
    print(
        "MANUAL VALUES"
    )

    print(
        "Manual length:",
        manual_length,
        "cm"
    )

    print(
        "Manual width:",
        manual_width,
        "cm"
    )


    # ========================================================
    # CALCULATE DIFFERENCES & SAVE TO DATAFRAME
    # ========================================================

    try:
        manual_length_numeric = float(manual_length)
        manual_width_numeric = float(manual_width)

        df.at[index, "true_leaf_length_cm"] = float(round(manual_length_numeric, 2))
        df.at[index, "true_leaf_width_cm"] = float(round(manual_width_numeric, 2))

        if manual_length_numeric > 0 and not np.isnan(opencv_length_cm):
            length_difference = abs(manual_length_numeric - opencv_length_cm)
            length_error_percent = (length_difference / manual_length_numeric) * 100

            df.at[index, "length_diff_cm"] = float(round(length_difference, 2))
            df.at[index, "length_error_percent"] = float(round(length_error_percent, 2))

            print("Length difference:", round(length_difference, 2), "cm")
            print("Length error %:", round(length_error_percent, 2), "%")

        if manual_width_numeric > 0 and not np.isnan(opencv_width_cm):
            width_difference = abs(manual_width_numeric - opencv_width_cm)
            width_error_percent = (width_difference / manual_width_numeric) * 100

            df.at[index, "width_diff_cm"] = float(round(width_difference, 2))
            df.at[index, "width_error_percent"] = float(round(width_error_percent, 2))

            print("Width difference:", round(width_difference, 2), "cm")
            print("Width error %:", round(width_error_percent, 2), "%")

    except Exception as e:
        print("Could not calculate manual/OpenCV difference:", e)


    # ========================================================
    # SAVE LARGEST LEAF MASK
    # ========================================================

    mask_filename = (

        os.path.splitext(
            image_name
        )[0]

        +
        "_largest_leaf.png"

    )


    mask_path = os.path.join(

        MASK_FOLDER,

        mask_filename

    )


    cv2.imwrite(

        mask_path,

        largest_leaf_mask * 255

    )


    # ========================================================
    # CREATE OVERLAY
    # ========================================================

    overlay = image.copy()


    # --------------------------------------------------------
    # Leaf contour
    # --------------------------------------------------------

    if largest_contour is not None:

        cv2.drawContours(

            overlay,

            [largest_contour],

            -1,

            (0, 255, 0),

            3

        )


    # --------------------------------------------------------
    # Minimum rectangle
    # --------------------------------------------------------

    if rect is not None:
        box = cv2.boxPoints(
            rect
        )
        box = np.int32(
            box
        )

        cv2.drawContours(
            overlay,
            [box],
            0,
            (255, 0, 0),
            2
        )

    # --------------------------------------------------------
    # Straight-line Tip-to-Base Length & Endpoints
    # --------------------------------------------------------
    if point_a is not None and point_b is not None:
        # Draw green endpoint (Point A / Tip)
        cv2.circle(
            overlay,
            point_a,
            8,
            (0, 255, 0),
            -1
        )

        # Draw red endpoint (Point B / Base)
        cv2.circle(
            overlay,
            point_b,
            8,
            (0, 0, 255),
            -1
        )

        # Draw straight measurement line (Blue)
        cv2.line(
            overlay,
            point_a,
            point_b,
            (255, 0, 0),
            3
        )


    # # --------------------------------------------------------
    # # Skeleton
    # # --------------------------------------------------------

    # if skeleton is not None:

    #     y_coords, x_coords = np.where(

    #         skeleton > 0

    #     )


    #     overlay[
    #         y_coords,
    #         x_coords
    #     ] = (
    #         0,
    #         0,
    #         255
    #     )


    # ========================================================
    # TEXT
    # ========================================================

    cv2.putText(

        overlay,

        f"Length: {opencv_length_cm:.2f} cm",

        (20, 40),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.75,

        (0, 255, 0),

        2

    )


    cv2.putText(

        overlay,

        f"Width: {opencv_width_cm:.2f} cm",

        (20, 75),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.75,

        (0, 255, 0),

        2

    )


    cv2.putText(

        overlay,

        f"Area: {opencv_leaf_area_cm2:.2f} cm2",

        (20, 110),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.75,

        (0, 255, 0),

        2

    )


    cv2.putText(

        overlay,

        f"Calibration: {calibration_source}",

        (20, 145),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.65,

        (255, 255, 0),

        2

    )


    # ========================================================
    # SAVE OVERLAY
    # ========================================================

    overlay_filename = (

        os.path.splitext(
            image_name
        )[0]

        +
        "_largest_leaf.jpg"

    )


    overlay_path = os.path.join(

        OVERLAY_FOLDER,

        overlay_filename

    )


    cv2.imwrite(

        overlay_path,

        overlay

    )


# ============================================================
# COMPUTE OVERALL EVALUATION METRICS (MAE & MEAN PERCENTAGE ERROR)
# ============================================================

mae_length = df["length_diff_cm"].mean()
mae_width = df["width_diff_cm"].mean()

valid_length_diffs = df["length_diff_cm"].dropna()
valid_width_diffs = df["width_diff_cm"].dropna()
all_diffs = pd.concat([valid_length_diffs, valid_width_diffs])
mae_overall = all_diffs.mean() if len(all_diffs) > 0 else np.nan

mpe_length = df["length_error_percent"].mean()
mpe_width = df["width_error_percent"].mean()

valid_length_errs = df["length_error_percent"].dropna()
valid_width_errs = df["width_error_percent"].dropna()
all_errs = pd.concat([valid_length_errs, valid_width_errs])
mpe_overall = all_errs.mean() if len(all_errs) > 0 else np.nan

print()
print("=" * 65)
print("OVERALL EVALUATION METRICS")
print("=" * 65)
print(f"MAE - Length:                      {mae_length:.2f} cm")
print(f"MAE - Width:                       {mae_width:.2f} cm")
print(f"Overall MAE:                       {mae_overall:.2f} cm")
print(f"Mean Percentage Error - Length:    {mpe_length:.2f} %")
print(f"Mean Percentage Error - Width:     {mpe_width:.2f} %")
print(f"Overall Mean Percentage Error:     {mpe_overall:.2f} %")
print("=" * 65)

# Create Summary DataFrame
summary_data = {
    "Metric": [
        "MAE - Length (cm)",
        "MAE - Width (cm)",
        "Overall MAE (cm)",
        "Mean Percentage Error - Length (%)",
        "Mean Percentage Error - Width (%)",
        "Overall Mean Percentage Error (%)"
    ],
    "Value": [
        round(float(mae_length), 4) if pd.notna(mae_length) else np.nan,
        round(float(mae_width), 4) if pd.notna(mae_width) else np.nan,
        round(float(mae_overall), 4) if pd.notna(mae_overall) else np.nan,
        round(float(mpe_length), 4) if pd.notna(mpe_length) else np.nan,
        round(float(mpe_width), 4) if pd.notna(mpe_width) else np.nan,
        round(float(mpe_overall), 4) if pd.notna(mpe_overall) else np.nan,
    ]
}
df_summary = pd.DataFrame(summary_data)

# SAVE TO EXCEL (WITH MULTIPLE SHEETS & SUMMARY ROWS)
try:
    with pd.ExcelWriter(OUTPUT_EXCEL, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Leaf Measurements", index=False)
        df_summary.to_excel(writer, sheet_name="Summary Metrics", index=False)
except Exception:
    df.to_excel(OUTPUT_EXCEL, index=False)

# ============================================================
# FINISHED
# ============================================================

print()
print("=" * 65)
print("PROCESS COMPLETED SUCCESSFULLY")
print("=" * 65)

print("Output Excel:", OUTPUT_EXCEL)
print("Masks Folder:", MASK_FOLDER)
print("Overlays Folder:", OVERLAY_FOLDER)

print("\nSAVED EXCEL COLUMNS:")
print("  true_leaf_length_cm")
print("  true_leaf_width_cm")
print("  opencv_leaf_length_cm")
print("  opencv_leaf_width_cm")
print("  length_diff_cm")
print("  width_diff_cm")
print("  length_error_percent")
print("  width_error_percent")
print("  opencv_leaf_area_cm2")
print("  opencv_pixels_per_cm")
print("  opencv_calibration")

print("=" * 65)

