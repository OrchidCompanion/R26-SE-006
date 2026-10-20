import io
import json
from unittest.mock import MagicMock, patch
import pytest
from PIL import Image

from main import app, evaluate_environmental_conditions
from database import save_sensor_reading, get_sensor_statistics
from mqtt_consumer import on_connect, on_message

pytestmark = pytest.mark.integration



def _create_synthetic_jpeg_bytes() -> io.BytesIO:
    """Helper to generate a valid JPEG photo in memory for testing multi-angle uploads."""
    img = Image.new("RGB", (60, 60), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


# ==============================================================================
# 1. REST IOT SENSOR INGESTION & FORWARDING INTEGRATION
# ==============================================================================

def test_iot_rest_sensor_reading_ingestion_and_forwarding(client):
    """
    Test IoT device (e.g. ESP32 microcontroller with DHT11 & BH1750) posting
    real-time telemetry to REST endpoint /sensor-reading. Verifies coordination
    with placement-service (East-West internal DNS forwarding).
    """
    mock_client = MagicMock()
    mock_dht_resp = MagicMock(status_code=201, json=lambda: {"id": "dht-1", "status": "recorded"})
    mock_bh_resp = MagicMock(status_code=201, json=lambda: {"id": "bh-1", "status": "recorded"})
    mock_client.post.side_effect = [mock_dht_resp, mock_bh_resp]

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        payload = {
            "temperature": "28.5",
            "humidity": "73.0",
            "light": "24500.0",
            "plant_id": "orchid-plant-01",
            "module_id": "esp32-node-alpha",
            "user_id": "user-it22190598",
        }
        res = client.post("/sensor-reading", data=payload)

        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["record"] == {"id": "bh-1", "status": "recorded"}

        # Verify forwarding to placement-service
        assert mock_client.post.call_count == 2
        dht_call, bh_call = mock_client.post.call_args_list

        assert "/api/sensors/dht11" in dht_call[0][0]
        assert dht_call[1]["json"] == {
            "temperature": 28.5,
            "humidity": 73.0,
            "plant_id": "orchid-plant-01",
            "module_id": "esp32-node-alpha",
            "user_id": "user-it22190598",
        }

        assert "/api/sensors/bh1750" in bh_call[0][0]
        assert bh_call[1]["json"] == {
            "lux": 24500.0,
            "plant_id": "orchid-plant-01",
            "module_id": "esp32-node-alpha",
            "user_id": "user-it22190598",
        }


def test_iot_rest_sensor_reading_header_user_id(client):
    """Verify X-User-Id header is passed to IoT telemetry if user_id form param is omitted."""
    mock_client = MagicMock()
    mock_client.post.return_value = MagicMock(status_code=200, json=lambda: {"status": "ok"})

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        payload = {
            "temperature": "27.0",
            "humidity": "71.0",
            "light": "21000.0",
            "plant_id": "plant-hdr",
        }
        headers = {"X-User-Id": "user-from-header"}
        res = client.post("/sensor-reading", data=payload, headers=headers)

        assert res.status_code == 200
        # Check user_id forwarded
        dht_call = mock_client.post.call_args_list[0]
        assert dht_call[1]["json"]["user_id"] == "user-from-header"


# ==============================================================================
# 2. MQTT IOT SENSOR STREAM INGESTION INTEGRATION
# ==============================================================================

def test_iot_mqtt_stream_ingestion_integration():
    """
    Test MQTT telemetry stream from ESP32 publishing to orchid/{user_id}/{plant_id}/env.
    Verifies payload extraction, type conversions, and forwarding.
    """
    mock_client = MagicMock()
    mock_client.post.return_value = MagicMock(status_code=201, json=lambda: {"saved": True})

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        mqtt_msg = MagicMock()
        mqtt_msg.topic = "orchid/usr_iot_77/plant_orch_99/env"
        mqtt_msg.payload = json.dumps({
            "temperature": 29.1,
            "humidity": 74.5,
            "light": 23500.0,
            "module_id": "esp32-s3-greenhouse",
        }).encode("utf-8")

        # Process MQTT event
        on_message(None, None, mqtt_msg)

        assert mock_client.post.call_count == 2
        dht_json = mock_client.post.call_args_list[0][1]["json"]
        assert dht_json["temperature"] == 29.1
        assert dht_json["humidity"] == 74.5
        assert dht_json["plant_id"] == "plant_orch_99"
        assert dht_json["user_id"] == "usr_iot_77"
        assert dht_json["module_id"] == "esp32-s3-greenhouse"


def test_iot_mqtt_alternative_keys_and_mac_address_integration():
    """
    Test IoT firmware sending shorthand keys ('temp', 'hum', 'lux', 'mac_address').
    Verifies automatic normalization to standard telemetry keys.
    """
    mock_client = MagicMock()
    mock_client.post.return_value = MagicMock(status_code=200, json=lambda: {"saved": True})

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        mqtt_msg = MagicMock()
        mqtt_msg.topic = "orchid/sensors/env"
        mqtt_msg.payload = json.dumps({
            "temp": 26.8,
            "hum": 72.2,
            "lux": 18900.0,
            "mac_address": "A4:CF:12:89:BC:DE",
            "plant_id": "plant-mac-test",
        }).encode("utf-8")

        on_message(None, None, mqtt_msg)

        assert mock_client.post.call_count == 2
        dht_json = mock_client.post.call_args_list[0][1]["json"]
        assert dht_json["temperature"] == 26.8
        assert dht_json["humidity"] == 72.2
        assert dht_json["module_id"] == "A4:CF:12:89:BC:DE"


# ==============================================================================
# 3. END-TO-END TELEMETRY TO PREDICTION PIPELINE INTEGRATION
# ==============================================================================

def test_iot_end_to_end_telemetry_flow_to_prediction(client):
    """
    Full End-to-End Integration Flow:
    1. IoT telemetry is recorded (30-day stats from placement service).
    2. User uploads 3 photos to /predict.
    3. Model 01 identifies blooming stage.
    4. Model 02 runs with the real IoT telemetry.
    5. Environmental evaluation validates conditions against Dendrobium standards.
    6. Prediction record is persisted with full sensor_summary and environment_evaluation.
    """
    mock_sensor_stats = {
        "avg_temp_c": 27.8,
        "min_temp_c": 25.5,
        "max_temp_c": 29.8,
        "temp_std_c": 1.2,
        "avg_humidity_rh": 73.1,
        "min_humidity_rh": 70.0,
        "max_humidity_rh": 75.0,
        "humidity_std_rh": 1.5,
        "avg_light_lux": 22400.0,
        "min_light_lux": 17500.0,
        "max_light_lux": 28000.0,
        "light_std_lux": 2100.0,
        "data_window_days": 30,
        "telemetry_samples_count": 144,
        "is_default_baseline": False,
    }

    mock_timeline = [
        {"from_stage": "Vegetative", "to_stage": "Mature_Pseudobulb", "transition_days": 21.0, "cumulative_days": 21.0},
        {"from_stage": "Mature_Pseudobulb", "to_stage": "Bud_formation", "transition_days": 14.0, "cumulative_days": 35.0},
        {"from_stage": "Bud_formation", "to_stage": "Flowering", "transition_days": 10.0, "cumulative_days": 45.0},
    ]

    mock_db_saved = {
        "id": "pred-rec-iot-001",
        "plant_id": "dendrobium-iot-plant",
        "current_stage": "Vegetative",
    }

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.94, True, None)):
        with patch("main.get_sensor_statistics", return_value=mock_sensor_stats):
            with patch("main.forecast_blooming_timeline", return_value=(45.0, mock_timeline)) as mock_forecast:
                with patch("main.save_prediction_history", return_value=mock_db_saved) as mock_save_history:
                    res = client.post(
                        "/predict",
                        data={"plant_id": "dendrobium-iot-plant", "user_id": "usr-iot-user"},
                        files=files,
                    )

                    assert res.status_code == 200
                    resp_data = res.json()

                    # 1. Verify Model 02 was provided real IoT sensor statistics
                    mock_forecast.assert_called_once_with("Vegetative", mock_sensor_stats)

                    # 2. Verify Environmental Evaluation evaluated the IoT sensor telemetry
                    env = resp_data["environment_evaluation"]
                    assert env["temperature_status"] == "Optimal"
                    assert env["humidity_status"] == "Optimal"
                    assert env["light_status"] == "Optimal"
                    assert env["temperature"]["value"] == 27.8
                    assert env["humidity"]["value"] == 73.1
                    assert env["light"]["value"] == 22400.0
                    assert "Environmental conditions are within the recommended range" in env["recommendation"]

                    # 3. Verify Database persistence includes the IoT sensor telemetry summary
                    saved_payload = mock_save_history.call_args[0][0]
                    assert saved_payload["plant_id"] == "dendrobium-iot-plant"
                    assert saved_payload["user_id"] == "usr-iot-user"
                    assert saved_payload["sensor_summary"]["telemetry_samples_count"] == 144
                    assert saved_payload["sensor_summary"]["avg_temp_c"] == 27.8
                    assert saved_payload["environment_evaluation"]["temperature"]["status"] == "optimal"


# ==============================================================================
# 4. IOT DISCONNECT & MISSING SENSOR DATA INTEGRATION
# ==============================================================================

def test_iot_sensors_completely_disconnected_rejection(client):
    """
    Verify safety requirement: When IoT sensors have recorded no data in the last
    30 days (get_sensor_statistics returns None), bloom prediction is blocked with
    HTTP 422 Unprocessable Entity, informing the user clearly without substituting
    fake baseline numbers.
    """
    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.90, True, None)):
        with patch("main.get_sensor_statistics", return_value=None):
            with patch("main.save_prediction_history") as mock_save:
                res = client.post("/predict", data={"plant_id": "plant-no-sensors"}, files=files)

                assert res.status_code == 422
                detail = res.json()["detail"]
                assert "No environmental sensor data found" in detail
                assert "DHT11 and BH1750 sensors" in detail
                assert "connect your sensor module" in detail

                # Verify database was NOT written
                mock_save.assert_not_called()


def test_iot_sensor_statistics_zero_samples_treated_as_no_data():
    """
    Verify get_sensor_statistics treats zero samples count or default baseline
    from placement-service as no data (returns None) so no fallback is applied.
    """
    mock_client = MagicMock()
    mock_resp = MagicMock(status_code=200)

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        # Case 1: samples count is 0
        mock_resp.json.return_value = {"telemetry_samples_count": 0, "avg_temp_c": 27.5}
        mock_client.get.return_value = mock_resp
        assert get_sensor_statistics(plant_id="p-0") is None

        # Case 2: marked as default baseline
        mock_resp.json.return_value = {"is_default_baseline": True, "telemetry_samples_count": 50}
        assert get_sensor_statistics(plant_id="p-0") is None


def test_iot_sensor_partial_disconnect_light_sensor_offline(client):
    """
    Test partial sensor failure: DHT11 is online (temperature & humidity present),
    but BH1750 light sensor is disconnected (avg_light_lux is None).
    Verifies:
    1. Pipeline does not crash with KeyError.
    2. Light status is reported as 'Unknown' with 'No Data (Sensor Disconnected)'.
    3. User is explicitly told: 'Missing sensor data for Light intensity (BH1750)'.
    """
    partial_sensor_stats = {
        "avg_temp_c": 28.0,
        "avg_humidity_rh": 72.0,
        "avg_light_lux": None,  # BH1750 Disconnected
        "telemetry_samples_count": 60,
    }

    mock_timeline = [{"from_stage": "Vegetative", "to_stage": "Flowering", "transition_days": 30.0, "cumulative_days": 30.0}]

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.91, True, None)):
        with patch("main.get_sensor_statistics", return_value=partial_sensor_stats):
            with patch("main.forecast_blooming_timeline", return_value=(30.0, mock_timeline)):
                with patch("main.save_prediction_history", return_value={"id": "rec-partial"}):
                    res = client.post("/predict", data={"plant_id": "plant-partial"}, files=files)

                    assert res.status_code == 200
                    env = res.json()["environment_evaluation"]

                    # DHT11 should be optimal
                    assert env["temperature_status"] == "Optimal"
                    assert env["humidity_status"] == "Optimal"

                    # BH1750 should report unknown/missing
                    assert env["light_status"] == "Unknown"
                    assert env["light"]["value"] is None
                    assert env["light"]["status_label"] == "No Data (Sensor Disconnected)"
                    assert "Missing sensor data for Light intensity (BH1750)" in env["recommendation"]


def test_iot_sensor_partial_disconnect_dht11_offline(client):
    """
    Test partial sensor failure: BH1750 is online (light=22000.0),
    but DHT11 is disconnected (temperature & humidity are None).
    """
    partial_sensor_stats = {
        "avg_temp_c": None,
        "avg_humidity_rh": None,
        "avg_light_lux": 22000.0,
        "telemetry_samples_count": 40,
    }

    mock_timeline = [{"from_stage": "Vegetative", "to_stage": "Flowering", "transition_days": 30.0, "cumulative_days": 30.0}]

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.91, True, None)):
        with patch("main.get_sensor_statistics", return_value=partial_sensor_stats):
            with patch("main.forecast_blooming_timeline", return_value=(30.0, mock_timeline)):
                with patch("main.save_prediction_history", return_value={"id": "rec-partial-2"}):
                    res = client.post("/predict", data={"plant_id": "plant-partial-2"}, files=files)

                    assert res.status_code == 200
                    env = res.json()["environment_evaluation"]

                    assert env["temperature_status"] == "Unknown"
                    assert env["humidity_status"] == "Unknown"
                    assert env["light_status"] == "Optimal"
                    assert "Missing sensor data for Temperature (DHT11), Humidity (DHT11)" in env["recommendation"]


# ==============================================================================
# 5. IOT EXTREME CLIMATE & AGRONOMIC REMEDIATION INTEGRATION
# ==============================================================================

def test_iot_sensor_extreme_heat_and_drought_alert_integration(client):
    """
    Test IoT sensors detecting heatwave / intense light / dry conditions:
    Temp=36.0°C (High), Humidity=55.0% (Low), Light=45000 Lux (High).
    Verifies actionable microclimate remedy is generated for the grower.
    """
    stress_stats = {
        "avg_temp_c": 36.0,
        "avg_humidity_rh": 55.0,
        "avg_light_lux": 45000.0,
        "telemetry_samples_count": 200,
    }

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Bud_formation", 0.95, True, None)):
        with patch("main.get_sensor_statistics", return_value=stress_stats):
            with patch("main.forecast_blooming_timeline", return_value=(12.0, [])):
                with patch("main.save_prediction_history", return_value={"id": "rec-heat"}):
                    res = client.post("/predict", data={"plant_id": "plant-heat"}, files=files)

                    assert res.status_code == 200
                    env = res.json()["environment_evaluation"]

                    assert env["temperature_status"] == "High"
                    assert env["humidity_status"] == "Low"
                    assert env["light_status"] == "High"

                    # Actionable recommendation for high heat, low humidity, high light
                    rec = env["recommendation"]
                    assert "cooler" in rec.lower()
                    assert "shaded" in rec.lower()
                    assert "pebble tray" in rec.lower()


def test_iot_sensor_cold_and_dark_stress_alert_integration(client):
    """
    Test IoT sensors detecting cold and dark conditions:
    Temp=18.0°C (Low), Humidity=72.0% (Normal), Light=8000 Lux (Low).
    Verifies actionable recommendation for warmth and morning sunlight.
    """
    stress_stats = {
        "avg_temp_c": 18.0,
        "avg_humidity_rh": 72.0,
        "avg_light_lux": 8000.0,
        "telemetry_samples_count": 150,
    }

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Vegetative", 0.92, True, None)):
        with patch("main.get_sensor_statistics", return_value=stress_stats):
            with patch("main.forecast_blooming_timeline", return_value=(35.0, [])):
                with patch("main.save_prediction_history", return_value={"id": "rec-cold"}):
                    res = client.post("/predict", data={"plant_id": "plant-cold"}, files=files)

                    assert res.status_code == 200
                    env = res.json()["environment_evaluation"]

                    assert env["temperature_status"] == "Low"
                    assert env["humidity_status"] == "Optimal"
                    assert env["light_status"] == "Low"
                    assert "warmer location with better natural light" in env["recommendation"]


# ==============================================================================
# 6. IOT NETWORK RESILIENCE & ERROR HANDLING INTEGRATION
# ==============================================================================

def test_iot_mqtt_consumer_corrupt_payload_resilience():
    """Verify corrupted non-JSON frames from noisy IoT radios do not crash subscriber."""
    msg = MagicMock()
    msg.topic = "orchid/sensors/env"
    msg.payload = b"\x00\xff\xfe\x01\x02CORRUPTED_BINARY"

    with patch("mqtt_consumer.save_sensor_reading") as mock_save:
        # Should gracefully catch exception and continue
        on_message(None, None, msg)
        mock_save.assert_not_called()


def test_iot_mqtt_consumer_downstream_network_error_resilience():
    """Verify network failure communicating with placement-service does not crash subscriber."""
    msg = MagicMock()
    msg.topic = "orchid/sensors/env"
    msg.payload = json.dumps({"temperature": 27.5, "humidity": 72.0, "light": 20000.0}).encode("utf-8")

    with patch("mqtt_consumer.save_sensor_reading", side_effect=Exception("HTTP connection timed out")):
        # Should log error and not propagate uncaught exception
        on_message(None, None, msg)


def test_iot_mqtt_on_connect_topic_subscriptions():
    """Verify on_connect registers all 3 required environmental sensor channels."""
    mock_mqtt_client = MagicMock()
    on_connect(mock_mqtt_client, None, {}, rc=0)

    assert mock_mqtt_client.subscribe.call_count == 3
    subscribed = [call[0][0] for call in mock_mqtt_client.subscribe.call_args_list]
    assert "orchid/+/+/env" in subscribed
    assert "orchid/sensors/env" in subscribed
    assert "orchid/telemetry/env" in subscribed


# ==============================================================================
# 7. IOT PREDICTION HISTORY LIFECYCLE & RETRIEVAL INTEGRATION
# ==============================================================================

def test_iot_historical_prediction_retrieval_integration(client):
    """
    Test querying historical bloom forecasts after IoT-driven predictions
    have been stored. Verifies that sensor_summary (IoT telemetry averages)
    and environmental evaluation recommendations are preserved in history output.
    """
    mock_history_records = [
        {
            "id": "rec-hist-01",
            "plant_id": "plant-hist-test",
            "user_id": "usr-hist-01",
            "current_stage": "Bud_formation",
            "estimated_flowering_date": "Nov 15 – Nov 25, 2026",
            "total_days_to_flowering": 14.0,
            "confidence": 92.0,
            "sensor_summary": {
                "avg_temp_c": 27.6,
                "avg_humidity_rh": 73.0,
                "avg_light_lux": 21500.0,
                "telemetry_samples_count": 120,
            },
            "environment_evaluation": {
                "temperature_status": "Optimal",
                "humidity_status": "Optimal",
                "light_status": "Optimal",
                "recommendation": "Environmental conditions are within the recommended range.",
            },
            "created_at": "2026-10-18T10:00:00Z",
        }
    ]

    with patch("main.get_plant_prediction_history", return_value={"data": mock_history_records, "total": 1, "page": 1, "limit": 10}):
        res_plant = client.get("/plant/plant-hist-test?page=1&limit=10")
        assert res_plant.status_code == 200
        plant_data = res_plant.json()
        assert plant_data["total"] == 1
        assert len(plant_data["data"]) == 1
        first_record = plant_data["data"][0]
        assert first_record["sensor_summary"]["avg_temp_c"] == 27.6
        assert first_record["sensor_summary"]["telemetry_samples_count"] == 120
        assert first_record["environment_evaluation"]["temperature_status"] == "Optimal"

    with patch("main.get_user_prediction_history", return_value=mock_history_records):
        res_user = client.get("/history?user_id=usr-hist-01")
        assert res_user.status_code == 200
        user_data = res_user.json()
        assert len(user_data) == 1
        assert user_data[0]["plant_id"] == "plant-hist-test"


def test_iot_active_bloom_stage_environmental_care_integration(client):
    """
    Test End-to-End prediction when orchid is already in the 'Flowering' stage.
    Verifies:
    1. Model 02 sets duration to 0 days ('Currently in Bloom').
    2. Real IoT sensor data is still evaluated to help grower maintain optimal
       microclimate and maximize flower longevity (prevent premature flower drop).
    3. Persisted database payload contains the IoT telemetry summary.
    """
    mock_sensor_stats = {
        "avg_temp_c": 26.5,
        "avg_humidity_rh": 72.0,
        "avg_light_lux": 19000.0,
        "telemetry_samples_count": 96,
        "is_default_baseline": False,
    }

    mock_db_saved = {
        "id": "rec-bloom-active",
        "plant_id": "plant-blooming-now",
        "current_stage": "Flowering",
    }

    files = {
        "image1": ("front.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image2": ("lat1.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
        "image3": ("lat2.jpg", _create_synthetic_jpeg_bytes(), "image/jpeg"),
    }

    with patch("main.predict_single_image_stage", return_value=("Flowering", 0.96, True, None)):
        with patch("main.get_sensor_statistics", return_value=mock_sensor_stats):
            with patch("main.save_prediction_history", return_value=mock_db_saved) as mock_save:
                res = client.post(
                    "/predict",
                    data={"plant_id": "plant-blooming-now", "user_id": "usr-bloom-keeper"},
                    files=files,
                )

                assert res.status_code == 200
                data = res.json()
                assert data["current_stage"] == "Flowering"
                assert data["total_days_to_flowering"] == 0.0
                assert data["weeks"] == 0
                assert data["prediction_msg"] == "Your Dendrobium orchid is currently in full bloom!"
                assert data["flowering_date_range_display"] == "Currently in Bloom"

                # Environmental evaluation should still actively evaluate IoT conditions
                env = data["environment_evaluation"]
                assert env["temperature_status"] == "Optimal"
                assert env["humidity_status"] == "Optimal"
                assert env["light_status"] == "Optimal"

                # Verify persistence included IoT readings for the blooming plant
                saved_payload = mock_save.call_args[0][0]
                assert saved_payload["current_stage"] == "Flowering"
                assert saved_payload["sensor_summary"]["avg_temp_c"] == 26.5
                assert saved_payload["sensor_summary"]["telemetry_samples_count"] == 96


def test_iot_prediction_record_soft_delete_lifecycle_integration(client):
    """
    Test soft-delete lifecycle endpoint DELETE /{record_id} for historical
    IoT-backed bloom prediction records.
    Verifies 200 on success and 404 when record is not found or already deleted.
    """
    # Success case: soft delete succeeds
    with patch("main.soft_delete_prediction_history", return_value=True):
        res = client.delete("/rec-iot-delete-101")
        assert res.status_code == 200
        assert res.json()["message"] == "Bloom record soft deleted successfully."

    # Failure case: already deleted or record ID not found
    with patch("main.soft_delete_prediction_history", return_value=False):
        res_fail = client.delete("/rec-missing-999")
        assert res_fail.status_code == 404
        assert "Record not found or already deleted" in res_fail.json()["detail"]


# ==============================================================================
# 8. MULTI-DEVICE IOT STREAM DEMULTIPLEXING & ISOLATION INTEGRATION
# ==============================================================================

def test_iot_multi_device_stream_demux_and_isolation_integration():
    """
    Test multiple distinct ESP32 IoT nodes streaming telemetry in rapid succession:
    Node A (User 1, Plant 10) and Node B (User 2, Plant 20).
    Verifies proper demultiplexing from topic paths, isolated parameter routing,
    and zero cross-contamination of sensor readings.
    """
    mock_client = MagicMock()
    mock_client.post.return_value = MagicMock(status_code=201, json=lambda: {"saved": True})

    with patch("httpx.Client") as mock_httpx:
        mock_httpx.return_value.__enter__.return_value = mock_client

        # Device 1: Node A in Greenhouse 1
        msg_a = MagicMock()
        msg_a.topic = "orchid/grower_1/plant_10/env"
        msg_a.payload = json.dumps({
            "temperature": 27.2,
            "humidity": 71.5,
            "light": 20800.0,
            "module_id": "esp32-greenhouse-1",
        }).encode("utf-8")

        # Device 2: Node B in Greenhouse 2
        msg_b = MagicMock()
        msg_b.topic = "orchid/grower_2/plant_20/env"
        msg_b.payload = json.dumps({
            "temperature": 29.8,
            "humidity": 74.8,
            "light": 28500.0,
            "module_id": "esp32-greenhouse-2",
        }).encode("utf-8")

        # Ingest both messages
        on_message(None, None, msg_a)
        on_message(None, None, msg_b)

        # 2 posts per message (DHT11 + BH1750) = 4 posts total
        assert mock_client.post.call_count == 4
        calls = mock_client.post.call_args_list

        # Verify Node A calls
        assert calls[0][1]["json"]["plant_id"] == "plant_10"
        assert calls[0][1]["json"]["user_id"] == "grower_1"
        assert calls[0][1]["json"]["temperature"] == 27.2
        assert calls[1][1]["json"]["plant_id"] == "plant_10"
        assert calls[1][1]["json"]["lux"] == 20800.0

        # Verify Node B calls
        assert calls[2][1]["json"]["plant_id"] == "plant_20"
        assert calls[2][1]["json"]["user_id"] == "grower_2"
        assert calls[2][1]["json"]["temperature"] == 29.8
        assert calls[3][1]["json"]["plant_id"] == "plant_20"
        assert calls[3][1]["json"]["lux"] == 28500.0

