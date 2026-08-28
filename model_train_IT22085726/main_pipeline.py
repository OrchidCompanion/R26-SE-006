"""
main_pipeline.py
-----------------
Full pipeline:
  Image → leaf area + greenness → growth stage → NPK recommendation

Run:
    python main_pipeline.py --image test_images/leaf.jpg --leaf-count 5

Or interactive:
    python main_pipeline.py
"""

import os
import sys
import argparse
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────
MODEL_PATH         = "models/best.pt"
GROWTH_MODEL_PATH  = "4_growth_model/growth_model.pkl"
ENCODER_PATH       = "4_growth_model/label_encoder.pkl"
RESULTS_DIR        = "results"
CAMERA_HEIGHT_CM   = 20.0
PIXELS_PER_CM      = 212.85
ORIGINAL_IMG_WIDTH = 4032
CONF               = 0.25
IMGSZ              = 640
# ─────────────────────────────────────────────────────────────────────────────

from leaf_analyzer      import LeafAnalyzer
from train_growth_model import predict as predict_stage, train, ensure_dataset
from fertilizer_table   import get_recommendation, print_recommendation

BANNER = """
==========================================================
   DENDROBIUM ORCHID CARE ASSISTANT
   Leaf Analysis → Growth Stage → NPK Recommendation
=========================================================="""


def ensure_model_trained():
    """Auto-train growth model on first run."""
    if not os.path.exists(GROWTH_MODEL_PATH):
        print("⚙️  Growth model not found — training now...\n")
        ensure_dataset()
        train()
        print()


def run_pipeline(image_path: str, leaf_count: int) -> dict:
    print(BANNER)
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # ── STEP 1 — Image analysis ───────────────────────────────────────────
    print("\n" + "-" * 56)
    print("  STEP 1 — IMAGE ANALYSIS")
    print("-" * 56)

    analyzer = LeafAnalyzer(
        model_path         = MODEL_PATH,
        conf               = CONF,
        imgsz              = IMGSZ,
        camera_height_cm   = CAMERA_HEIGHT_CM,
        pixels_per_cm      = PIXELS_PER_CM,
        original_img_width = ORIGINAL_IMG_WIDTH,
    )

    result = analyzer.analyze(image_path)

    if not result["leaf_detected"]:
        print("\n  ❌ ERROR: Leaf not detected.")
        for w in result["warnings"]:
            print(f"     {w}")
        sys.exit(1)

    leaf_area_cm2   = result["leaf_area_cm2"]
    greenness       = result["greenness"]
    nitrogen_status = result["nitrogen_status"]

    print(f"\n  Leaf detected    : ✅")
    print(f"  Leaf area        : {leaf_area_cm2} cm²")
    print(f"  Greenness index  : {greenness}")
    print(f"  Nitrogen status  : {nitrogen_status}")
    print(f"  Leaf count input : {leaf_count}")

    # ── STEP 2 — Growth stage prediction ─────────────────────────────────
    print("\n" + "-" * 56)
    print("  STEP 2 — GROWTH STAGE PREDICTION")
    print("-" * 56)

    stage_result = predict_stage(
        leaf_area_cm2   = leaf_area_cm2,
        greenness_index = greenness,
        leaf_count      = leaf_count,
        model_path      = GROWTH_MODEL_PATH,
        encoder_path    = ENCODER_PATH,
    )
    stage = stage_result["stage"]

    print(f"\n  Predicted stage  : {stage}")
    print(f"\n  Confidence breakdown:")
    for s, p in sorted(stage_result["probabilities"].items(),
                       key=lambda x: -x[1]):
        bar  = "█" * int(p * 30)
        flag = "  ◀ predicted" if s == stage else ""
        print(f"    {s:<15} {p:.3f}  {bar}{flag}")

    # ── STEP 3 — Fertilizer recommendation ───────────────────────────────
    print("\n" + "-" * 56)
    print("  STEP 3 — FERTILIZER & NPK RECOMMENDATION")
    print("-" * 56)

    rec = get_recommendation(
        stage               = stage,
        nitrogen_status_str = nitrogen_status,
    )
    print_recommendation(rec)

    # ── Save annotated image ──────────────────────────────────────────────
    annotated_path = os.path.join(RESULTS_DIR, "pipeline_result.jpg")
    _, _ = analyzer.analyze_and_visualize(
        image_path, save_path=annotated_path
    )
    print(f"\n  ✅ Annotated image → {annotated_path}")

    # ── Save text report ──────────────────────────────────────────────────
    report_path = os.path.join(RESULTS_DIR, "pipeline_report.txt")
    with open(report_path, "w") as f:
        f.write("DENDROBIUM ORCHID CARE REPORT\n")
        f.write("=" * 45 + "\n")
        f.write(f"Image            : {image_path}\n")
        f.write(f"Leaf count       : {leaf_count}\n")
        f.write(f"Leaf area        : {leaf_area_cm2} cm²\n")
        f.write(f"Greenness index  : {greenness}\n")
        f.write(f"Nitrogen status  : {nitrogen_status}\n")
        f.write(f"Growth stage     : {stage}\n")
        f.write(f"\nConfidence:\n")
        for s, p in sorted(stage_result["probabilities"].items(),
                           key=lambda x: -x[1]):
            f.write(f"  {s:<15} {p:.3f}\n")
        f.write(f"\nTarget NPK levels for [{stage}]:\n")
        for k, v in rec.npk_normal.items():
            f.write(f"  {k} : {v} ppm\n")
        f.write(f"\nFertilizer dose per litre:\n")
        f.write(f"  N : {rec.base_dose.N_g_per_L} g/L\n")
        f.write(f"  P : {rec.base_dose.P_g_per_L} g/L\n")
        f.write(f"  K : {rec.base_dose.K_g_per_L} g/L\n")
        f.write(f"  Apply : {rec.base_dose.frequency}\n")
        f.write(f"  Note  : {rec.base_dose.notes}\n")
        if rec.advice:
            f.write(f"\nAdvisory:\n")
            for a in rec.advice:
                f.write(f"  - {a}\n")

    print(f"  ✅ Report saved   → {report_path}")

    return {
        "leaf_area_cm2":   leaf_area_cm2,
        "greenness":       greenness,
        "nitrogen_status": nitrogen_status,
        "growth_stage":    stage,
        "npk_target":      rec.npk_normal,
        "dose":            rec.base_dose,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Dendrobium Orchid Care Assistant"
    )
    parser.add_argument("--image",      type=str, default=None,
                        help="Path to leaf image")
    parser.add_argument("--leaf-count", type=int, default=None,
                        help="Number of leaves on the plant")
    args = parser.parse_args()

    ensure_model_trained()

    # Get image path
    image_path = args.image
    if image_path is None:
        image_path = input("\n  Enter path to leaf image: ").strip().strip('"')

    if not os.path.exists(image_path):
        print(f"\n  ❌ File not found: {image_path}")
        sys.exit(1)

    # Get leaf count
    leaf_count = args.leaf_count
    if leaf_count is None:
        while True:
            try:
                leaf_count = int(
                    input("  Enter number of leaves on the plant: ").strip()
                )
                if leaf_count > 0:
                    break
                print("  Please enter a positive integer.")
            except ValueError:
                print("  Invalid — enter a whole number.")

    run_pipeline(image_path=image_path, leaf_count=leaf_count)


if __name__ == "__main__":
    main()