"""
recommendation_engine.py
Dendrobium Orchid NPK Fertilizer Recommendation Engine
"""

from typing import Dict, Any

TARGET_RATIOS = {
    "Vegetative": {
        "ratio_str": "30-10-10",
        "n": 30.0,
        "p": 10.0,
        "k": 10.0,
        "frequency": "Every 7–10 days",
        "notes": "High Nitrogen promotes strong vegetative canes and lush leaf development.",
    },
    "Pre Flowering": {
        "ratio_str": "20-20-20",
        "n": 20.0,
        "p": 20.0,
        "k": 20.0,
        "frequency": "Every 7 days",
        "notes": "Balanced ratio prepares mature pseudobulbs for flower spike initiation.",
    },
    "Spike": {
        "ratio_str": "20-20-20",
        "n": 20.0,
        "p": 20.0,
        "k": 20.0,
        "frequency": "Every 7 days",
        "notes": "Supports healthy elongation of nascent flower spikes.",
    },
    "Matured": {
        "ratio_str": "6-30-30",
        "n": 6.0,
        "p": 30.0,
        "k": 30.0,
        "frequency": "Every 10–14 days",
        "notes": "High Phosphorus & Potassium booster promotes vibrant, long-lasting blossoms.",
    },
    "Flowering": {
        "ratio_str": "6-30-30",
        "n": 6.0,
        "p": 30.0,
        "k": 30.0,
        "frequency": "Every 14 days",
        "notes": "Mild feeding to sustain bloom longevity without burning flower petals.",
    },
    "Seedling": {
        "ratio_str": "10-10-10",
        "n": 10.0,
        "p": 10.0,
        "k": 10.0,
        "frequency": "Every 14 days (half strength)",
        "notes": "Gentle, balanced feeding for delicate developing root systems.",
    },
}

RATIO_TOLERANCE_PCT = 5.0


def _get_nutrient_status(current_pct: float, target_pct: float) -> str:
    if current_pct < target_pct - RATIO_TOLERANCE_PCT:
        return "deficient"
    elif current_pct > target_pct + RATIO_TOLERANCE_PCT:
        return "excess"
    return "optimal"


def evaluate_npk(
    stage: str,
    nitrogen: float,
    phosphorous: float,
    potassium: float,
) -> Dict[str, Any]:
    """
    Evaluates NPK sensor readings against target fertilizer formulations
    for the detected Dendrobium orchid growth stage.
    """
    matched_stage = stage if stage in TARGET_RATIOS else "Vegetative"
    target = TARGET_RATIOS[matched_stage]

    n_val = float(nitrogen)
    p_val = float(phosphorous)
    k_val = float(potassium)
    sensor_total = n_val + p_val + k_val

    # Avoid division by zero
    if sensor_total <= 0.0:
        sensor_total = 1.0

    curr_n_pct = round((n_val / sensor_total) * 100.0, 1)
    curr_p_pct = round((p_val / sensor_total) * 100.0, 1)
    curr_k_pct = round((k_val / sensor_total) * 100.0, 1)

    target_total = target["n"] + target["p"] + target["k"]
    target_n_pct = round((target["n"] / target_total) * 100.0, 1)
    target_p_pct = round((target["p"] / target_total) * 100.0, 1)
    target_k_pct = round((target["k"] / target_total) * 100.0, 1)

    n_status = _get_nutrient_status(curr_n_pct, target_n_pct)
    p_status = _get_nutrient_status(curr_p_pct, target_p_pct)
    k_status = _get_nutrient_status(curr_k_pct, target_k_pct)

    adjustments = []
    if n_status == "deficient":
        adjustments.append("Increase Nitrogen proportion")
    elif n_status == "excess":
        adjustments.append("Reduce Nitrogen proportion")

    if p_status == "deficient":
        adjustments.append("Increase Phosphorus proportion")
    elif p_status == "excess":
        adjustments.append("Reduce Phosphorus proportion")

    if k_status == "deficient":
        adjustments.append("Increase Potassium proportion")
    elif k_status == "excess":
        adjustments.append("Reduce Potassium proportion")

    if not adjustments:
        recommendation_text = f"Soil nutrient balance is optimal for the {matched_stage} stage. Continue feeding with standard {target['ratio_str']} fertilizer."
    else:
        recommendation_text = f"Adjust nutrient balance for {matched_stage} stage ({target['ratio_str']}): {', '.join(adjustments)}."

    return {
        "growth_stage": matched_stage,
        "target_ratio": target["ratio_str"],
        "recommended_formulation": f"NPK {target['ratio_str']}",
        "frequency": target["frequency"],
        "notes": target["notes"],
        "readings": {
            "nitrogen_mg_kg": n_val,
            "phosphorus_mg_kg": p_val,
            "potassium_mg_kg": k_val,
        },
        "current_relative_balance": {
            "nitrogen_pct": curr_n_pct,
            "phosphorus_pct": curr_p_pct,
            "potassium_pct": curr_k_pct,
        },
        "target_relative_balance": {
            "nitrogen_pct": target_n_pct,
            "phosphorus_pct": target_p_pct,
            "potassium_pct": target_k_pct,
        },
        "status": {
            "nitrogen": n_status,
            "phosphorus": p_status,
            "potassium": k_status,
        },
        "recommendation": recommendation_text,
    }
