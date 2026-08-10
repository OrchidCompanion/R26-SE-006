"""
npk_recommendation.py

Dendrobium Orchid NPK Fertilizer Recommendation

The recommendation is based ONLY on the predicted growth stage.

Growth-stage fertilizer targets:

    Vegetative     -> 30-10-10
    Pre Flowering  -> 10-52-10
    Matured        -> 6-30-30

The NPK sensor provides N, P and K readings in mg/kg.

The system:
1. Receives the predicted growth stage.
2. Selects ONLY the fertilizer ratio for that growth stage.
3. Compares the relative N-P-K sensor balance with that target.
4. Identifies nutrients that are relatively deficient or excessive.
5. Tells the user which nutrient should be increased or reduced.
6. Tells the user to gradually adjust fertilizer and re-test.
7. Stops recommending adjustments when the balance is within
   the selected tolerance of the target ratio.

IMPORTANT:
The fertilizer ratios (30-10-10, 10-52-10 and 6-30-30) represent
fertilizer formulations, not direct soil nutrient thresholds.

The system does NOT calculate an exact fertilizer quantity in
grams or millilitres because that requires additional validated
information such as fertilizer concentration, growing-medium mass,
application volume and crop-specific dosing data.
"""


# ============================================================
# TARGET FERTILIZER RATIOS
# ============================================================

TARGET_RATIOS = {

    "Vegetative": {
        "ratio_str": "30-10-10",
        "n": 30.0,
        "p": 10.0,
        "k": 10.0,
    },

    "Pre Flowering": {
        "ratio_str": "10-52-10",
        "n": 10.0,
        "p": 52.0,
        "k": 10.0,
    },

    "Matured": {
        "ratio_str": "6-30-30",
        "n": 6.0,
        "p": 30.0,
        "k": 30.0,
    },
}


# ============================================================
# ALLOWED DEVIATION FROM TARGET
# ============================================================
#
# The target fertilizer ratio is converted into relative
# percentages for comparison with the sensor readings.
#
# Example:
#
# 30-10-10
#
# Total = 50
#
# N = 30 / 50 = 60%
# P = 10 / 50 = 20%
# K = 10 / 50 = 20%
#
# A tolerance of 5 percentage points is used.
#
# This means a nutrient is considered approximately balanced
# when its measured relative percentage is within +/- 5
# percentage points of its target percentage.
#
# ============================================================

RATIO_TOLERANCE_PCT = 5.0


# ============================================================
# GET NUTRIENT STATUS
# ============================================================

def _get_nutrient_status(
    current_pct: float,
    target_pct: float
) -> str:

    """
    Determine whether a nutrient is relatively deficient,
    excessive or optimal compared with the target ratio.
    """

    if current_pct < target_pct - RATIO_TOLERANCE_PCT:

        return "deficient"

    elif current_pct > target_pct + RATIO_TOLERANCE_PCT:

        return "excess"

    return "optimal"


# ============================================================
# MAIN NPK EVALUATION FUNCTION
# ============================================================

def evaluate_npk(
    stage: str,
    nitrogen: float,
    phosphorous: float,
    potassium: float
) -> dict:

    """
    Evaluate NPK sensor readings according to the predicted
    Dendrobium orchid growth stage.

    ONLY the fertilizer ratio belonging to the predicted
    growth stage is used.

    Parameters
    ----------
    stage : str
        Predicted growth stage.

        Valid values:
            "Vegetative"
            "Pre Flowering"
            "Matured"

    nitrogen : float
        Nitrogen sensor reading in mg/kg.

    phosphorous : float
        Phosphorus sensor reading in mg/kg.

    potassium : float
        Potassium sensor reading in mg/kg.


    Returns
    -------
    dict

        Contains:

        growth_stage
        readings
        current_relative_balance
        target_ratio
        target_relative_balance
        status
        recommendation
    """


    # ========================================================
    # VALIDATE GROWTH STAGE
    # ========================================================

    if stage not in TARGET_RATIOS:

        raise ValueError(
            f"Unknown growth stage: '{stage}'. "
            f"Expected one of: {list(TARGET_RATIOS.keys())}"
        )


    # ========================================================
    # CONVERT SENSOR VALUES TO FLOAT
    # ========================================================

    nitrogen = float(nitrogen)
    phosphorous = float(phosphorous)
    potassium = float(potassium)


    # ========================================================
    # GET ONLY THE CURRENT STAGE CONFIGURATION
    # ========================================================

    target = TARGET_RATIOS[stage]

    target_ratio = target["ratio_str"]

    target_n = target["n"]
    target_p = target["p"]
    target_k = target["k"]


    # ========================================================
    # CONVERT TARGET RATIO TO RELATIVE PERCENTAGES
    # ========================================================

    target_total = (
        target_n
        + target_p
        + target_k
    )


    target_n_pct = (
        target_n / target_total
    ) * 100.0

    target_p_pct = (
        target_p / target_total
    ) * 100.0

    target_k_pct = (
        target_k / target_total
    ) * 100.0


    # ========================================================
    # CALCULATE SENSOR TOTAL
    # ========================================================

    sensor_total = (
        nitrogen
        + phosphorous
        + potassium
    )


    # ========================================================
    # HANDLE ZERO SENSOR READINGS
    # ========================================================

    if sensor_total <= 0:

        return {

            "growth_stage": stage,

            "readings": {
                "nitrogen": nitrogen,
                "phosphorous": phosphorous,
                "potassium": potassium,
            },

            "current_relative_balance": {
                "nitrogen": 0.0,
                "phosphorous": 0.0,
                "potassium": 0.0,
            },

            "target_ratio": target_ratio,

            "target_relative_balance": {
                "nitrogen": round(target_n_pct, 2),
                "phosphorous": round(target_p_pct, 2),
                "potassium": round(target_k_pct, 2),
            },

            "status": {
                "nitrogen": "unknown",
                "phosphorous": "unknown",
                "potassium": "unknown",
            },

            "recommendation": [

                f"No valid NPK sensor readings were detected.",

                f"The current growth stage is {stage}.",

                f"The target fertilizer ratio for this stage is "
                f"{target_ratio}.",

                "Obtain a valid NPK sensor reading before "
                "adjusting fertilizer."
            ],
        }


    # ========================================================
    # CALCULATE CURRENT RELATIVE NPK BALANCE
    # ========================================================

    current_n_pct = (
        nitrogen / sensor_total
    ) * 100.0

    current_p_pct = (
        phosphorous / sensor_total
    ) * 100.0

    current_k_pct = (
        potassium / sensor_total
    ) * 100.0


    # ========================================================
    # DETERMINE NUTRIENT STATUS
    # ========================================================

    n_status = _get_nutrient_status(
        current_n_pct,
        target_n_pct
    )

    p_status = _get_nutrient_status(
        current_p_pct,
        target_p_pct
    )

    k_status = _get_nutrient_status(
        current_k_pct,
        target_k_pct
    )


    status = {

        "nitrogen": n_status,

        "phosphorous": p_status,

        "potassium": k_status,
    }


    # ========================================================
    # CREATE RECOMMENDATIONS
    # ========================================================

    advice = []


    # ========================================================
    # VEGETATIVE STAGE
    # ========================================================

    if stage == "Vegetative":

        # ----------------------------------------------------
        # Nitrogen
        # ----------------------------------------------------

        if n_status == "deficient":

            advice.append(
                "Nitrogen is relatively deficient for the "
                "Vegetative stage. Gradually increase "
                "nitrogen-containing fertilizer and re-test "
                "the NPK level."
            )

        elif n_status == "excess":

            advice.append(
                "Nitrogen is relatively excessive for the "
                "Vegetative stage. Do not increase nitrogen "
                "fertilizer further."
            )


        # ----------------------------------------------------
        # Phosphorus
        # ----------------------------------------------------

        if p_status == "deficient":

            advice.append(
                "Phosphorus is relatively deficient. "
                "Gradually increase phosphorus input and "
                "re-test the NPK level."
            )

        elif p_status == "excess":

            advice.append(
                "Phosphorus is relatively excessive. "
                "Do not increase phosphorus fertilizer further."
            )


        # ----------------------------------------------------
        # Potassium
        # ----------------------------------------------------

        if k_status == "deficient":

            advice.append(
                "Potassium is relatively deficient. "
                "Gradually increase potassium input and "
                "re-test the NPK level."
            )

        elif k_status == "excess":

            advice.append(
                "Potassium is relatively excessive. "
                "Do not increase potassium fertilizer further."
            )


        # ----------------------------------------------------
        # Stage-specific target
        # ----------------------------------------------------

        advice.append(
            "For the Vegetative growth stage, adjust the "
            "fertilizer program toward the 30-10-10 N-P-K ratio. "
            "Add fertilizer gradually and re-test the NPK "
            "readings until the measured nutrient balance "
            "approaches this target ratio."
        )


    # ========================================================
    # PRE FLOWERING STAGE
    # ========================================================

    elif stage == "Pre Flowering":

        # ----------------------------------------------------
        # Nitrogen
        # ----------------------------------------------------

        if n_status == "deficient":

            advice.append(
                "Nitrogen is relatively deficient for the "
                "Pre Flowering stage. Gradually increase "
                "nitrogen input and re-test the NPK level."
            )

        elif n_status == "excess":

            advice.append(
                "Nitrogen is relatively excessive for the "
                "Pre Flowering stage. Do not increase nitrogen "
                "further. Avoid excessive nitrogen because "
                "the plant is transitioning toward flowering."
            )


        # ----------------------------------------------------
        # Phosphorus
        # ----------------------------------------------------

        if p_status == "deficient":

            advice.append(
                "Phosphorus is relatively deficient for the "
                "Pre Flowering stage. Gradually increase "
                "phosphorus input and re-test the NPK level "
                "to support flower initiation."
            )

        elif p_status == "excess":

            advice.append(
                "Phosphorus is relatively excessive. "
                "Do not increase phosphorus fertilizer further."
            )


        # ----------------------------------------------------
        # Potassium
        # ----------------------------------------------------

        if k_status == "deficient":

            advice.append(
                "Potassium is relatively deficient. "
                "Gradually increase potassium input and "
                "re-test the NPK level."
            )

        elif k_status == "excess":

            advice.append(
                "Potassium is relatively excessive. "
                "Do not increase potassium fertilizer further."
            )


        # ----------------------------------------------------
        # Stage-specific target
        # ----------------------------------------------------

        advice.append(
            "For the Pre Flowering growth stage, adjust the "
            "fertilizer program toward the 10-52-10 N-P-K ratio. "
            "Add fertilizer gradually and re-test the NPK "
            "readings until the measured nutrient balance "
            "approaches this target ratio."
        )


    # ========================================================
    # MATURED STAGE
    # ========================================================

    elif stage == "Matured":

        # ----------------------------------------------------
        # Nitrogen
        # ----------------------------------------------------

        if n_status == "deficient":

            advice.append(
                "Nitrogen is relatively deficient for the "
                "Matured stage. Make only gradual adjustments "
                "and re-test the NPK level."
            )

        elif n_status == "excess":

            advice.append(
                "Nitrogen is relatively excessive for the "
                "Matured stage. Do not increase nitrogen "
                "fertilizer further."
            )


        # ----------------------------------------------------
        # Phosphorus
        # ----------------------------------------------------

        if p_status == "deficient":

            advice.append(
                "Phosphorus is relatively deficient. "
                "Gradually increase phosphorus input and "
                "re-test the NPK level."
            )

        elif p_status == "excess":

            advice.append(
                "Phosphorus is relatively excessive. "
                "Do not increase phosphorus fertilizer further."
            )


        # ----------------------------------------------------
        # Potassium
        # ----------------------------------------------------

        if k_status == "deficient":

            advice.append(
                "Potassium is relatively deficient for the "
                "Matured stage. Gradually increase potassium "
                "input and re-test the NPK level."
            )

        elif k_status == "excess":

            advice.append(
                "Potassium is relatively excessive. "
                "Do not increase potassium fertilizer further."
            )


        # ----------------------------------------------------
        # Stage-specific target
        # ----------------------------------------------------

        advice.append(
            "For the Matured growth stage, adjust the fertilizer "
            "program toward the 6-30-30 N-P-K ratio. Add "
            "fertilizer gradually and re-test the NPK readings "
            "until the measured nutrient balance approaches "
            "this target ratio."
        )


    # ========================================================
    # CHECK WHETHER THE CURRENT BALANCE IS ALREADY OPTIMAL
    # ========================================================

    all_optimal = (
        n_status == "optimal"
        and p_status == "optimal"
        and k_status == "optimal"
    )


    if all_optimal:

        advice = [

            f"The current NPK balance is within the target "
            f"range for the {stage} growth stage.",

            f"Target fertilizer ratio for this stage: "
            f"{target_ratio}.",

            "No major nutrient adjustment is currently "
            "recommended. Maintain the current fertilizer "
            "program and continue monitoring NPK levels."
        ]


    # ========================================================
    # RETURN RESULT
    # ========================================================

    return {

        "growth_stage": stage,

        "readings": {

            "nitrogen": nitrogen,

            "phosphorous": phosphorous,

            "potassium": potassium,
        },

        "current_relative_balance": {

            "nitrogen": round(
                current_n_pct,
                2
            ),

            "phosphorous": round(
                current_p_pct,
                2
            ),

            "potassium": round(
                current_k_pct,
                2
            ),
        },

        "target_ratio": target_ratio,

        "target_relative_balance": {

            "nitrogen": round(
                target_n_pct,
                2
            ),

            "phosphorous": round(
                target_p_pct,
                2
            ),

            "potassium": round(
                target_k_pct,
                2
            ),
        },

        "status": status,

        "recommendation": advice,
    }


# ============================================================
# PRINT NPK RECOMMENDATION
# ============================================================

def print_npk_recommendation(result: dict):

    print("\n")
    print("==========================================")
    print("       SOIL NPK RECOMMENDATION")
    print("==========================================")

    print(
        f"Growth stage: "
        f"{result['growth_stage']}"
    )

    print(
        f"Target fertilizer ratio: "
        f"{result['target_ratio']}"
    )


    # ========================================================
    # SENSOR READINGS
    # ========================================================

    readings = result["readings"]

    print("\nSensor Readings:")

    print(
        f"  Nitrogen:    "
        f"{readings['nitrogen']:.1f} mg/kg"
    )

    print(
        f"  Phosphorus:  "
        f"{readings['phosphorous']:.1f} mg/kg"
    )

    print(
        f"  Potassium:   "
        f"{readings['potassium']:.1f} mg/kg"
    )


    # ========================================================
    # CURRENT RELATIVE BALANCE
    # ========================================================

    if "current_relative_balance" in result:

        balance = result[
            "current_relative_balance"
        ]

        print("\nCurrent Relative NPK Balance:")

        print(
            f"  Nitrogen:    "
            f"{balance['nitrogen']:.2f}%"
        )

        print(
            f"  Phosphorus:  "
            f"{balance['phosphorous']:.2f}%"
        )

        print(
            f"  Potassium:   "
            f"{balance['potassium']:.2f}%"
        )


    # ========================================================
    # TARGET BALANCE
    # ========================================================

    if "target_relative_balance" in result:

        target = result[
            "target_relative_balance"
        ]

        print("\nTarget Relative Balance:")

        print(
            f"  Nitrogen:    "
            f"{target['nitrogen']:.2f}%"
        )

        print(
            f"  Phosphorus:  "
            f"{target['phosphorous']:.2f}%"
        )

        print(
            f"  Potassium:   "
            f"{target['potassium']:.2f}%"
        )


    # ========================================================
    # NUTRIENT STATUS
    # ========================================================

    print("\nNutrient Status:")

    for nutrient in (
        "nitrogen",
        "phosphorous",
        "potassium"
    ):

        print(
            f"  {nutrient.capitalize():12s}: "
            f"[{result['status'][nutrient]}]"
        )


    # ========================================================
    # RECOMMENDATIONS
    # ========================================================

    print("\nRecommendation:")

    for line in result["recommendation"]:

        print(
            f"  - {line}"
        )

    print(
        "\n=========================================="
    )