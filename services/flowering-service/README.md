# Orchid Flowering Lifecycle Microservice (IT22190598)

This microservice handles **Dendrobium Orchid Blooming Stage Identification** and **Flowering Date Timeline Forecasting** using a two-stage machine learning workflow:
- **Model 01 (Computer Vision)**: Identifies the current blooming stage state from 3 user-uploaded photos (Frontal 90°, Lateral 1, Lateral 2) via confidence-weighted majority voting.
- **Model 02 (Environmental Regression)**: Takes the detected stage along with IoT environmental sensor statistics (temperature, humidity, light intensity) and date features to forecast transition durations and the estimated flowering date.
- **MQTT Telemetry Integration**: Ingests real-time temperature, humidity, and ambient light intensity streams from the ESP32-S3 Environment Module.

---

## 1. Local Development (Without Docker)

1. Activate your virtual environment and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and configure Member IT22190598's Supabase credentials.
3. Run the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 7862 --reload
   ```
4. Access interactive API documentation: [http://localhost:7862/docs](http://localhost:7862/docs)

---

## 2. Deploying to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space):
   - **Space Name**: e.g., `orchid-flowering-service`
   - **SDK**: **Docker** (Blank)
   - **Hardware**: CPU basic (2 vCPU, 16 GB RAM)
2. Push the files in this directory to the Space Git repository:
   - `Dockerfile`
   - `requirements.txt`
   - `main.py`
   - `database.py`
   - `model_service.py`
   - `mqtt_consumer.py`
   - `models/` (`checkpoint_best_total.pth`, `gradient_boosting_experiment.joblib`)
3. Under **Space Settings -> Secrets**, add:
   - `FLOWERING_SUPABASE_URL`: Your Supabase URL
   - `FLOWERING_SUPABASE_KEY`: Your Supabase Anon or Service Role key
   - `MQTT_BROKER_HOST`: Your cloud broker host (e.g. HiveMQ / EMQX)
4. Once deployed, the service is accessible at:
   `https://<your-username>-orchid-flowering-service.hf.space`

---

## 3. API Endpoints

- `POST /predict` (or `/api/bloom/predict`): Multi-angle photo upload for stage prediction and forecast timeline generation.
- `POST /validate-image`: Single image check for orchid botanical foliage/features.
- `GET /plant/{plant_id}`: Retrieve historical forecasts for a specific plant.
- `GET /history`: Retrieve all historical forecasts for a user.
- `POST /sensor-reading`: Ingest environmental sensor reading directly via REST.
