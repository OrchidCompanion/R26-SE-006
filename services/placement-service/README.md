# Orchid Plant Placement Analysis Microservice

This microservice handles **Microclimate Location Suitability Testing**, **ESP32-S3 Hardware Node Pairing**, and **Environmental Condition Verification** (temperature, humidity, light intensity) for orchid species (Dendrobium, Phalaenopsis, Oncidium):
- **Live Environmental Sampling**: Runs 60-second multi-point sampling from the ESP32-S3 Environment Module.
- **Species Threshold Suitability**: Checks sampled averages against optimal botanical thresholds (Dendrobium: 25–30°C, 70–75% RH, 16,000–32,000 Lux).
- **MQTT Telemetry Integration**: Subscribes to live DHT11 and BH1750 streams via MQTT and caches readings for instant response.

---

## 1. Local Development (Without Docker)

1. Activate your virtual environment and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and set Supabase credentials.
3. Run the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 7864 --reload
   ```
4. Access interactive API documentation: [http://localhost:7864/docs](http://localhost:7864/docs)

---

## 2. Deploying to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space):
   - **Space Name**: e.g., `orchid-placement-service`
   - **SDK**: **Docker** (Blank)
   - **Hardware**: CPU basic (2 vCPU, 16 GB RAM)
2. Push the files in this directory to the Space Git repository:
   - `Dockerfile`
   - `requirements.txt`
   - `main.py`
   - `database.py`
   - `mqtt_hub.py`
   - `placement_evaluator.py`
3. Under **Space Settings -> Secrets**, add:
   - `PLACEMENT_SUPABASE_URL`: Your Supabase URL
   - `PLACEMENT_SUPABASE_KEY`: Your Supabase Anon or Service Role key
   - `MQTT_BROKER_HOST`: Your cloud broker host (e.g. HiveMQ / EMQX)
4. Once deployed, the service is accessible at:
   `https://<your-username>-orchid-placement-service.hf.space`

---

## 3. API Endpoints

- `POST /evaluate`: Evaluates microclimate samples against orchid species criteria and returns verdict & recommendation.
- `GET /modules/{module_id}/read-ambient`: Fetches real-time ambient telemetry (temperature, humidity, lux) from MQTT cache/DB.
- `GET /modules/{module_id}/status`: Verifies if the ESP32 is online.
- `POST /modules`: Pairs/registers a new ESP32 sensor module.
- `GET /locations`: Lists user location zones.
