"""
fertilizer_table.py
--------------------
Static fertilizer dose and NPK target table for
Dendrobium orchid growth stages.
"""

from dataclasses import dataclass, field
from typing      import Dict


@dataclass
class FertilizerDose:
    N_g_per_L: float
    P_g_per_L: float
    K_g_per_L: float
    frequency: str
    notes:     str = ""


@dataclass
class Recommendation:
    stage:          str
    nitrogen_level: str
    base_dose:      FertilizerDose
    npk_normal:     Dict[str, str]
    advice:         list = field(default_factory=list)


# ── Target NPK ranges per stage (ppm) ────────────────────────────────────────
STAGE_NPK_NORMAL = {
    "Seedling":   {"N": "5–15",  "P": "3–8",   "K": "5–15"},
    "Vegetative": {"N": "15–30", "P": "5–15",  "K": "15–30"},
    "Spike":      {"N": "10–20", "P": "10–20", "K": "20–40"},
    "Flowering":  {"N": "5–10",  "P": "15–25", "K": "25–50"},
    "Post-bloom": {"N": "10–25", "P": "8–15",  "K": "15–30"},
}

# ── Dose table (g per litre of water) ────────────────────────────────────────
FERTILIZER_TABLE: Dict[str, Dict[str, FertilizerDose]] = {

    "Seedling": {
        "Sufficient": FertilizerDose(0.5, 0.3, 0.3, "Every 14 days",
                                     "Dilute feed; roots are delicate."),
        "Adequate":   FertilizerDose(0.8, 0.4, 0.4, "Every 14 days",
                                     "Standard seedling feed."),
        "Low":        FertilizerDose(1.2, 0.5, 0.5, "Every 10 days",
                                     "Boost N slightly; watch for root burn."),
        "Deficient":  FertilizerDose(1.5, 0.5, 0.5, "Every 7 days",
                                     "Urgent N correction; flush pot first."),
    },
    "Vegetative": {
        "Sufficient": FertilizerDose(1.0, 0.5, 0.8, "Every 10 days",
                                     "Maintain balanced growth."),
        "Adequate":   FertilizerDose(1.5, 0.6, 1.0, "Every 7 days",
                                     "Standard vegetative programme."),
        "Low":        FertilizerDose(2.0, 0.7, 1.2, "Every 7 days",
                                     "Increase N; ensure good drainage."),
        "Deficient":  FertilizerDose(2.5, 0.8, 1.5, "Every 5 days",
                                     "High N correction; monitor weekly."),
    },
    "Spike": {
        "Sufficient": FertilizerDose(0.8, 1.0, 1.5, "Every 10 days",
                                     "Shift to bloom booster (high P/K)."),
        "Adequate":   FertilizerDose(1.0, 1.2, 1.8, "Every 7 days",
                                     "Standard spike-stage feed."),
        "Low":        FertilizerDose(1.3, 1.2, 2.0, "Every 7 days",
                                     "Add N slightly; keep P/K elevated."),
        "Deficient":  FertilizerDose(1.8, 1.2, 2.0, "Every 5 days",
                                     "Correct N deficiency; keep P/K high."),
    },
    "Flowering": {
        "Sufficient": FertilizerDose(0.5, 1.2, 2.0, "Every 14 days",
                                     "Minimal N; focus on K for bloom quality."),
        "Adequate":   FertilizerDose(0.7, 1.3, 2.2, "Every 10 days",
                                     "Standard flowering feed."),
        "Low":        FertilizerDose(1.0, 1.3, 2.2, "Every 7 days",
                                     "Gentle N increase; do not exceed 1.0 g/L."),
        "Deficient":  FertilizerDose(1.2, 1.2, 2.0, "Every 7 days",
                                     "Correct yellowing; reduce if flowers drop."),
    },
    "Post-bloom": {
        "Sufficient": FertilizerDose(1.0, 0.6, 1.2, "Every 10 days",
                                     "Recovery feed; resume balanced NPK."),
        "Adequate":   FertilizerDose(1.5, 0.8, 1.5, "Every 7 days",
                                     "Build reserves for next spike."),
        "Low":        FertilizerDose(2.0, 0.8, 1.8, "Every 7 days",
                                     "Boost N for recovery; watch roots."),
        "Deficient":  FertilizerDose(2.5, 1.0, 2.0, "Every 5 days",
                                     "Aggressive recovery; flush salts monthly."),
    },
}


def _map_nitrogen(status_str: str) -> str:
    s = status_str.lower()
    if "deficient" in s: return "Deficient"
    if "low"       in s: return "Low"
    if "adequate"  in s: return "Adequate"
    return "Sufficient"


def get_recommendation(stage:               str,
                       nitrogen_status_str: str) -> Recommendation:
    if stage not in FERTILIZER_TABLE:
        raise ValueError(
            f"Unknown stage '{stage}'. "
            f"Valid: {list(FERTILIZER_TABLE.keys())}"
        )

    n_key         = _map_nitrogen(nitrogen_status_str)
    base          = FERTILIZER_TABLE[stage][n_key]
    normal_ranges = STAGE_NPK_NORMAL[stage]

    advice = []
    if n_key == "Deficient":
        advice.append(
            "Severe nitrogen deficiency detected. "
            "Flush pot with plain water before applying fertilizer."
        )
    elif n_key == "Low":
        advice.append(
            "Mild nitrogen shortage. "
            "Increase feeding frequency until leaf colour improves."
        )

    return Recommendation(
        stage          = stage,
        nitrogen_level = n_key,
        base_dose      = base,
        npk_normal     = normal_ranges,
        advice         = advice,
    )


def print_recommendation(rec: Recommendation):
    n = rec.npk_normal
    d = rec.base_dose
    print("\n" + "=" * 55)
    print("  FERTILIZER RECOMMENDATION")
    print("=" * 55)
    print(f"  Growth stage     : {rec.stage}")
    print(f"  Nitrogen status  : {rec.nitrogen_level}")
    print(f"\n  Target NPK levels for [{rec.stage}] stage:")
    print(f"    Nitrogen   (N) : {n['N']} ppm")
    print(f"    Phosphorus (P) : {n['P']} ppm")
    print(f"    Potassium  (K) : {n['K']} ppm")
    print(f"\n  Fertilizer dose (per litre of water):")
    print(f"    N : {d.N_g_per_L} g/L")
    print(f"    P : {d.P_g_per_L} g/L")
    print(f"    K : {d.K_g_per_L} g/L")
    print(f"    Apply  : {d.frequency}")
    if d.notes:
        print(f"    Note   : {d.notes}")
    if rec.advice:
        print(f"\n  Advisory:")
        for a in rec.advice:
            print(f"      {a}")
    print("=" * 55)