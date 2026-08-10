import cv2
import numpy as np
from ultralytics import YOLO
from pathlib import Path
from typing import Any

# ── CAMERA CALIBRATION ──────────────────────────────
CAMERA_HEIGHT_CM   = 20.0
PIXELS_PER_CM      = 212.85   # measured on original photo at 20cm height
ORIGINAL_IMG_WIDTH = 4032     # phone's full resolution width
# ────────────────────────────────────────────────────


def compute_greenness_hsv(image_bgr: np.ndarray, mask: np.ndarray) -> float:
    hsv   = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    H     = hsv[:, :, 0]
    S     = hsv[:, :, 1]
    V     = hsv[:, :, 2]
    valid = mask.astype(bool)

    h = H[valid]
    s = S[valid]
    v = V[valid]

    if len(h) == 0:
        return 0.0

    print(f"    [DEBUG] Hue  — min:{h.min():3d} max:{h.max():3d} mean:{h.mean():.1f}")
    print(f"    [DEBUG] Sat  — min:{s.min():3d} max:{s.max():3d} mean:{s.mean():.1f}")
    print(f"    [DEBUG] Val  — min:{v.min():3d} max:{v.max():3d} mean:{v.mean():.1f}")

    total = len(h)

    deep_green  = ((h >= 35) & (h <= 85))
    light_green = ((h >= 25) & (h <  35))
    yellow      = ((h >= 15) & (h <  25))
    brown       = ((h >=  5) & (h <  15))

    deep_green_ratio  = np.sum(deep_green)  / total
    light_green_ratio = np.sum(light_green) / total
    yellow_ratio      = np.sum(yellow)      / total
    brown_ratio       = np.sum(brown)       / total

    print(f"    [DEBUG] DeepGreen:{deep_green_ratio:.2f}  "
          f"LightGreen:{light_green_ratio:.2f}  "
          f"Yellow:{yellow_ratio:.2f}  "
          f"Brown:{brown_ratio:.2f}")

    bright     = v > 30
    sat_weight = (np.mean(s[bright]) / 255.0) if np.any(bright) else 0.1

    greenness = (
        deep_green_ratio  * 1.0 +
        light_green_ratio * 0.5 -
        yellow_ratio      * 0.5 -
        brown_ratio       * 1.0
    ) * (sat_weight + 0.3)

    print(f"    [DEBUG] sat_weight:{sat_weight:.3f}  greenness:{greenness:.4f}")

    return float(max(0.0, min(1.0, greenness)))


def nitrogen_status(gi: float) -> str:
    if gi > 0.5:
        return "Sufficient"
    elif gi > 0.3:
        return "Adequate"
    elif gi > 0.15:
        return "Low"
    else:
        return "Deficient"


class LeafAnalyzer:
    def __init__(self,
                 model_path:          str   = "models/best.pt",
                 conf:                float = 0.25,
                 imgsz:               int   = 640,
                 camera_height_cm:    float = CAMERA_HEIGHT_CM,
                 pixels_per_cm:       float = PIXELS_PER_CM,
                 original_img_width:  int   = ORIGINAL_IMG_WIDTH):

        if not Path(model_path).exists():
            raise FileNotFoundError(f"Model not found: {model_path}")

        self.model              = YOLO(model_path)
        self.conf               = conf
        self.imgsz              = imgsz
        self.camera_height_cm   = camera_height_cm
        self.pixels_per_cm      = pixels_per_cm
        self.original_img_width = original_img_width

        print(f"✅ Model loaded        : {model_path}")
        print(f"   Classes             : {self.model.names}")
        print(f"   Camera height       : {camera_height_cm} cm")
        print(f"   Pixels per cm       : {pixels_per_cm} (at original resolution)")
        print(f"   Original img width  : {original_img_width} px")

    def _get_scale(self, img_w: int) -> tuple:
        """
        Adjust pixels_per_cm for the actual image size.
        Roboflow resizes images to 640px — we must scale down accordingly.

        scale_factor   = actual_img_width / original_img_width
        adj_px_per_cm  = pixels_per_cm * scale_factor
        adj_px_per_cm2 = adj_px_per_cm²
        """
        # Use the larger dimension in case photo is portrait
        ref_width      = max(img_w, self.original_img_width
                             if img_w > 640 else img_w)
        scale_factor   = img_w / self.original_img_width
        adj_px_per_cm  = self.pixels_per_cm * scale_factor
        adj_px_per_cm2 = adj_px_per_cm ** 2

        print(f"    [SCALE] img_width:{img_w}px  "
              f"original:{self.original_img_width}px  "
              f"scale:{scale_factor:.4f}  "
              f"adj_px/cm:{adj_px_per_cm:.2f}  "
              f"adj_px/cm²:{adj_px_per_cm2:.2f}")

        return scale_factor, adj_px_per_cm, adj_px_per_cm2

    def analyze(self, image_path: str) -> dict:
        result = {
            "image":             Path(image_path).name,
            "camera_height_cm":  self.camera_height_cm,
            "pixels_per_cm":     self.pixels_per_cm,
            "leaf_area_cm2":     None,
            "greenness":         None,
            "nitrogen_status":   None,
            "leaf_detected":     False,
            "warnings":          [],
        }

        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Image not found: {image_path}")

        img_h, img_w = img.shape[:2]

        # Adjust scale for this image's actual resolution
        scale_factor, adj_px_per_cm, adj_px_per_cm2 = self._get_scale(img_w)
        result["scale_factor"]   = round(scale_factor,   4)
        result["adj_px_per_cm"]  = round(adj_px_per_cm,  2)
        result["adj_px_per_cm2"] = round(adj_px_per_cm2, 2)

        predictions = self.model(img, conf=self.conf, imgsz=self.imgsz)
        pred        = predictions[0]

        if pred.masks is None:
            result["warnings"].append("No masks detected.")
            return result

        leaf_masks = []

        for i, mask_data in enumerate(pred.masks.data):
            cls_id   = int(pred.boxes.cls[i])
            label    = self.model.names[cls_id]
            det_conf = float(pred.boxes.conf[i])

            mask = mask_data.cpu().numpy().astype(np.float32)
            mask = cv2.resize(mask, (img_w, img_h),
                              interpolation=cv2.INTER_LINEAR)
            mask = (mask > 0.5).astype(np.uint8)

            if "leaf" in label.lower():
                leaf_masks.append((mask, det_conf))
                result["leaf_detected"] = True

        if not leaf_masks:
            result["warnings"].append("Leaf not detected.")
            return result

        if len(leaf_masks) > 1:
            result["warnings"].append(
                f"{len(leaf_masks)} leaf segments found — using largest."
            )

        leaf_mask, leaf_conf  = max(leaf_masks, key=lambda x: np.sum(x[0]))
        leaf_pixels           = float(np.sum(leaf_mask))
        leaf_area_cm2         = leaf_pixels / adj_px_per_cm2
        gi                    = compute_greenness_hsv(img, leaf_mask)

        print(f"    [AREA]  leaf_pixels:{leaf_pixels:.0f}  "
              f"leaf_area:{leaf_area_cm2:.4f} cm²")

        result["leaf_area_cm2"]   = round(leaf_area_cm2, 4)
        result["greenness"]       = round(gi, 4)
        result["nitrogen_status"] = nitrogen_status(gi)

        return result

    def analyze_and_visualize(self, image_path: str,
                               save_path: str = None) -> tuple:
        result = self.analyze(image_path)

        predictions = self.model(
            image_path,
            conf=self.conf,
            imgsz=self.imgsz,
            save=False,
        )
        annotated = predictions[0].plot()

        if save_path:
            cv2.imwrite(save_path, annotated)

        return result, annotated

    def validate(self,
                 data_yaml: str,
                 split:     str = "test") -> dict[str, Any]:

        data_yaml = str(Path(data_yaml).resolve())

        metrics = self.model.val(
            data=data_yaml,
            split=split,
            conf=self.conf,
            imgsz=self.imgsz,
            plots=True,
            save_json=True,
        )

        f1 = (2 * metrics.box.mp * metrics.box.mr /
              (metrics.box.mp + metrics.box.mr + 1e-9))

        report = {
            "precision":    round(metrics.box.mp,    4),
            "recall":       round(metrics.box.mr,    4),
            "f1":           round(f1,                4),
            "box_map50":    round(metrics.box.map50, 4),
            "box_map50_95": round(metrics.box.map,   4),
            "seg_map50":    round(metrics.seg.map50, 4),
            "seg_map50_95": round(metrics.seg.map,   4),
            "per_class":    {},
        }

        for i, name in self.model.names.items():
            report["per_class"][name] = {
                "box_mAP50":  round(metrics.box.ap50[i], 4),
                "box_mAP95":  round(metrics.box.ap[i],   4),
                "mask_mAP50": round(metrics.seg.ap50[i], 4),
                "mask_mAP95": round(metrics.seg.ap[i],   4),
            }

        return report