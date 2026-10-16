"""
placement_evaluator.py
Environmental condition and orchid placement suitability evaluator
"""

from typing import Dict, Any, List
import numpy as np

THRESHOLDS = {
    "Dendrobium": {
        "temp_min": 25.0,
        "temp_max": 30.0,
        "hum_min": 70.0,
        "hum_max": 75.0,
        "lux_min": 16000.0,
        "lux_max": 32000.0,
    },
    "Phalaenopsis": {
        "temp_min": 22.0,
        "temp_max": 28.0,
        "hum_min": 60.0,
        "hum_max": 75.0,
        "lux_min": 10000.0,
        "lux_max": 18000.0,
    },
    "Oncidium": {
        "temp_min": 20.0,
        "temp_max": 26.0,
        "hum_min": 55.0,
        "hum_max": 70.0,
        "lux_min": 18000.0,
        "lux_max": 28000.0,
    },
}


def evaluate_placement(
    species: str,
    readings: List[Dict[str, float]],
) -> Dict[str, Any]:
    """
    Evaluates sampled environmental readings (temperature, humidity, light)
    against the target orchid species thresholds.
    """
    selected_species = species if species in THRESHOLDS else "Dendrobium"
    rule = THRESHOLDS[selected_species]

    if not readings:
        readings = [{"temp": 27.5, "hum": 72.0, "lux": 20000.0}]

    temps = [float(r.get("temp", 27.5)) for r in readings]
    hums = [float(r.get("hum", 72.0)) for r in readings]
    luxs = [float(r.get("lux", 20000.0)) for r in readings]

    avg_temp = round(float(np.mean(temps)), 1)
    avg_hum = round(float(np.mean(hums)), 1)
    avg_lux = round(float(np.mean(luxs)), 0)

    # Temperature check
    if avg_temp < rule["temp_min"]:
        temp_status = "low"
        temp_msg = f"Temperature is cool ({avg_temp}°C < {rule['temp_min']}°C)."
    elif avg_temp > rule["temp_max"]:
        temp_status = "high"
        temp_msg = f"Temperature is warm ({avg_temp}°C > {rule['temp_max']}°C)."
    else:
        temp_status = "optimal"
        temp_msg = f"Temperature is optimal ({avg_temp}°C)."

    # Humidity check
    if avg_hum < rule["hum_min"]:
        hum_status = "low"
        hum_msg = f"Air humidity is dry ({avg_hum}% < {rule['hum_min']}%)."
    elif avg_hum > rule["hum_max"]:
        hum_status = "high"
        hum_msg = f"Air humidity is high ({avg_hum}% > {rule['hum_max']}%)."
    else:
        hum_status = "optimal"
        hum_msg = f"Air humidity is optimal ({avg_hum}%)."

    # Light check
    if avg_lux < rule["lux_min"]:
        lux_status = "low"
        lux_msg = f"Light intensity is insufficient ({avg_lux:,.0f} Lux < {rule['lux_min']:,.0f} Lux)."
    elif avg_lux > rule["lux_max"]:
        lux_status = "high"
        lux_msg = f"Light intensity is excessively bright ({avg_lux:,.0f} Lux > {rule['lux_max']:,.0f} Lux)."
    else:
        lux_status = "optimal"
        lux_msg = f"Light intensity is optimal ({avg_lux:,.0f} Lux)."

    # Overall verdict
    optimal_count = sum(1 for s in (temp_status, hum_status, lux_status) if s == "optimal")
    if optimal_count == 3:
        verdict = "Optimal Location"
        recommendation = f"This location provides ideal microclimate conditions for {selected_species} orchids. Keep the plant in this spot!"
    elif optimal_count == 2:
        verdict = "Suitable with Minor Adjustments"
        issues = []
        if temp_status != "optimal": issues.append(temp_msg)
        if hum_status != "optimal": issues.append(hum_msg)
        if lux_status != "optimal": issues.append(lux_msg)
        recommendation = f"Good location overall. Adjust: {'; '.join(issues)}."
    else:
        verdict = "Unfavorable Location"
        recommendation = "Multiple microclimate factors deviate from standard requirements. Recommend relocating to a better sheltered and illuminated area."

    return {
        "species": selected_species,
        "sample_count": len(readings),
        "averages": {
            "temperature_c": avg_temp,
            "humidity_rh": avg_hum,
            "light_lux": avg_lux,
        },
        "thresholds": rule,
        "status": {
            "temperature": temp_status,
            "humidity": hum_status,
            "light": lux_status,
        },
        "verdict": verdict,
        "recommendation": recommendation,
    }
