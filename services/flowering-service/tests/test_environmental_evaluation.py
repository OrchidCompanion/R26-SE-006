import pytest
from main import evaluate_environmental_conditions


def test_evaluate_environmental_all_optimal():
    """Verify recommendation and status when all 3 factors are within optimal range."""
    res = evaluate_environmental_conditions(avg_temp=27.5, avg_humidity=72.5, avg_light=20000.0)

    assert res["temperature_status"] == "Optimal"
    assert res["humidity_status"] == "Optimal"
    assert res["light_status"] == "Optimal"
    assert "within the recommended range" in res["recommendation"]
    assert "Maintain the current orchid location" in res["recommendation"]

    # Verify structured metrics
    assert res["temperature"]["status"] == "optimal"
    assert res["temperature"]["target"] == "25–30 °C"
    assert res["temperature"]["status_label"] == "Optimal (25–30 °C)"
    assert res["temperature"]["value"] == 27.5

    assert res["humidity"]["status"] == "optimal"
    assert res["humidity"]["target"] == "70–75 %"
    assert res["humidity"]["status_label"] == "Optimal (70–75%)"
    assert res["humidity"]["value"] == 72.5

    assert res["light"]["status"] == "optimal"
    assert res["light"]["target"] == "16,000–32,000 Lux"
    assert res["light"]["status_label"] == "Optimal (16,000–32,000 Lux)"
    assert res["light"]["value"] == 20000.0


def test_evaluate_environmental_none_inputs_reports_no_sensor_data():
    """Verify None inputs report missing sensor data instead of using fake fallback numbers."""
    res = evaluate_environmental_conditions(avg_temp=None, avg_humidity=None, avg_light=None)

    assert res["temperature_status"] == "Unknown"
    assert res["humidity_status"] == "Unknown"
    assert res["light_status"] == "Unknown"
    assert res["temperature"]["value"] is None
    assert res["humidity"]["value"] is None
    assert res["light"]["value"] is None
    assert "No environmental sensor data recorded" in res["recommendation"]
    assert "Connect your DHT11 and BH1750" in res["recommendation"]


def test_evaluate_environmental_partial_missing_sensor():
    """Verify individual disconnected sensor (e.g. light is None) is detected and reported."""
    res = evaluate_environmental_conditions(avg_temp=27.0, avg_humidity=72.0, avg_light=None)

    assert res["temperature_status"] == "Optimal"
    assert res["humidity_status"] == "Optimal"
    assert res["light_status"] == "Unknown"
    assert res["light"]["value"] is None
    assert res["light"]["status_label"] == "No Data (Sensor Disconnected)"
    assert "Missing sensor data for Light intensity (BH1750)" in res["recommendation"]


def test_evaluate_environmental_boundary_conditions():
    """Verify exact inclusive boundaries for temperature [25, 30], humidity [70, 75], light [16000, 32000]."""
    # Lower boundary inclusive
    lower_bound = evaluate_environmental_conditions(avg_temp=25.0, avg_humidity=70.0, avg_light=16000.0)
    assert lower_bound["temperature_status"] == "Optimal"
    assert lower_bound["humidity_status"] == "Optimal"
    assert lower_bound["light_status"] == "Optimal"

    # Upper boundary inclusive
    upper_bound = evaluate_environmental_conditions(avg_temp=30.0, avg_humidity=75.0, avg_light=32000.0)
    assert upper_bound["temperature_status"] == "Optimal"
    assert upper_bound["humidity_status"] == "Optimal"
    assert upper_bound["light_status"] == "Optimal"

    # Just below boundary
    just_below = evaluate_environmental_conditions(avg_temp=24.9, avg_humidity=69.9, avg_light=15999.0)
    assert just_below["temperature_status"] == "Low"
    assert just_below["humidity_status"] == "Low"
    assert just_below["light_status"] == "Low"

    # Just above boundary
    just_above = evaluate_environmental_conditions(avg_temp=30.1, avg_humidity=75.1, avg_light=32001.0)
    assert just_above["temperature_status"] == "High"
    assert just_above["humidity_status"] == "High"
    assert just_above["light_status"] == "High"


@pytest.mark.parametrize(
    "temp,hum,light,expected_keyword",
    [
        (20.0, 60.0, 10000.0, "warmer and brighter sheltered location"),
        (35.0, 80.0, 40000.0, "cooler, shaded and well-ventilated location away from strong afternoon sunlight"),
        (20.0, 60.0, 40000.0, "warmer location with filtered natural shade to reduce direct sunlight"),
        (20.0, 80.0, 10000.0, "warmer, brighter, and well-ventilated location with gentle morning sunlight"),
        (20.0, 80.0, 40000.0, "warmer location with natural shade to reduce excessive direct sunlight"),
        (35.0, 60.0, 10000.0, "cooler location with bright, filtered natural light, and place a shallow water-and-pebble tray"),
        (35.0, 60.0, 40000.0, "cooler, naturally shaded location away from harsh afternoon sun"),
        (35.0, 80.0, 10000.0, "cooler, brighter, and well-ventilated location away from high heat"),
    ],
)
def test_evaluate_environmental_3_factors_abnormal(temp, hum, light, expected_keyword):
    """Verify all 8 combinations where all 3 environmental parameters are abnormal."""
    res = evaluate_environmental_conditions(avg_temp=temp, avg_humidity=hum, avg_light=light)
    assert expected_keyword in res["recommendation"]


@pytest.mark.parametrize(
    "temp,hum,light,expected_keyword",
    [
        (20.0, 72.0, 10000.0, "warmer location with better natural light"),
        (35.0, 72.0, 40000.0, "cooler, naturally shaded location away from strong afternoon sunlight while maintaining suitable airflow"),
        (27.0, 60.0, 10000.0, "brighter location with gentle morning sunlight and place a shallow water-and-pebble tray"),
        (27.0, 80.0, 40000.0, "partially shaded, well-ventilated location and reduce exposure to strong direct sunlight"),
        (20.0, 60.0, 20000.0, "warmer, sheltered location and place a shallow water-and-pebble tray nearby"),
        (35.0, 80.0, 20000.0, "cooler, well-ventilated location and avoid excessive watering"),
        (20.0, 80.0, 20000.0, "warmer, well-ventilated location and avoid overwatering while maintaining current suitable light"),
        (35.0, 60.0, 20000.0, "cooler, well-ventilated location and place a shallow water-and-pebble tray nearby to increase local humidity"),
        (35.0, 72.0, 10000.0, "cooler location with bright, filtered natural light so that temperature can be reduced"),
        (20.0, 72.0, 40000.0, "warmer location with filtered natural light to reduce excessive direct sunlight"),
        (27.0, 60.0, 40000.0, "Reduce excessive direct sunlight with natural shade while placing a shallow water-and-pebble tray"),
        (27.0, 80.0, 10000.0, "brighter, well-ventilated location and avoid keeping the growing environment excessively wet"),
    ],
)
def test_evaluate_environmental_2_factors_abnormal(temp, hum, light, expected_keyword):
    """Verify all 12 combinations where exactly 2 environmental parameters are abnormal."""
    res = evaluate_environmental_conditions(avg_temp=temp, avg_humidity=hum, avg_light=light)
    assert expected_keyword in res["recommendation"]


@pytest.mark.parametrize(
    "temp,hum,light,expected_keyword,factor_status",
    [
        (20.0, 72.0, 20000.0, "warmer, sheltered location while maintaining its current suitable humidity", ("Low", "Optimal", "Optimal")),
        (35.0, 72.0, 20000.0, "cooler, naturally shaded location while maintaining suitable filtered light", ("High", "Optimal", "Optimal")),
        (27.0, 60.0, 20000.0, "place a shallow water-and-pebble tray nearby to provide additional local humidity", ("Optimal", "Low", "Optimal")),
        (27.0, 80.0, 20000.0, "improve natural air circulation, and avoid excessive watering", ("Optimal", "High", "Optimal")),
        (27.0, 72.0, 10000.0, "brighter location with gentle morning sunlight while maintaining its current", ("Optimal", "Optimal", "Low")),
        (27.0, 72.0, 40000.0, "Reduce direct sunlight using natural shade or a light curtain", ("Optimal", "Optimal", "High")),
    ],
)
def test_evaluate_environmental_1_factor_abnormal(temp, hum, light, expected_keyword, factor_status):
    """Verify all 6 cases where exactly 1 environmental parameter is abnormal."""
    res = evaluate_environmental_conditions(avg_temp=temp, avg_humidity=hum, avg_light=light)
    assert expected_keyword in res["recommendation"]
    assert (res["temperature_status"], res["humidity_status"], res["light_status"]) == factor_status


def test_evaluate_environmental_labels_and_rounding():
    """Verify that values are properly rounded to 2 decimal places and status labels match."""
    res = evaluate_environmental_conditions(avg_temp=24.12345, avg_humidity=78.9876, avg_light=15432.1)
    assert res["temperature"]["value"] == 24.12
    assert res["temperature"]["status_label"] == "Below Standard (< 25 °C)"

    assert res["humidity"]["value"] == 78.99
    assert res["humidity"]["status_label"] == "Above Standard (> 75%)"

    assert res["light"]["value"] == 15432.1
    assert res["light"]["status_label"] == "Below Standard (< 16,000 Lux)"
