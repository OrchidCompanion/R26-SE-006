# Orchid Disease & Treatment Microservice (IT22250124)

This microservice handles orchid leaf disease diagnosis (**Bacterial Brown Spot**, **Black Rot**, **Healthy**, and **Invalid**) using a 3-model weighted ensemble (YOLO lesion detection + MobileNetV2 + Custom CNN), correlates leaf symptoms with 7-day soil NPK telemetry via MQTT, and generates actionable treatment plans.

---

## 1. Local Development (Without Docker)

1. Activate your virtual environment and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and fill in Member IT22250124's Supabase credentials.
3. Run the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 7861 --reload
   ```
4. Access interactive API documentation: [http://localhost:7861/docs](http://localhost:7861/docs)

---

## 2. Deploying to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space):
   - **Space Name**: e.g., `orchid-disease-service`
   - **SDK**: **Docker** (Blank)
   - **Hardware**: CPU basic (2 vCPU, 16 GB RAM)
2. Push the files from this directory to the Space Git repository:
   - `Dockerfile`
   - `requirements.txt`
   - `main.py`
   - `database.py`
   - `model_service.py`
   - `mqtt_consumer.py`
   - `models/` (`disease_yolo.pt`, `disease_mobilenetv2.keras`, `disease_custom_cnn.keras`)
3. Under **Space Settings -> Secrets**, add:
   - `DISEASE_SUPABASE_URL`: Your Supabase URL
   - `DISEASE_SUPABASE_KEY`: Your Supabase Anon or Service Role key
   - `MQTT_BROKER_HOST`: Your cloud broker host (e.g. HiveMQ / EMQX)
4. Once running, the service is reachable at:
   `https://<your-username>-orchid-disease-service.hf.space`

---

## 3. API Endpoints

- `POST /analyze` (or `/api/disease/analyze`): Upload leaf image and plant ID for ensemble diagnosis and treatment.
- `GET /plant/{plant_id}/npk-history`: Retrieve 7-day soil NPK window.
- `GET /plant/{plant_id}`: Retrieve diagnostic history for a specific orchid plant.
- `GET /history`: Fetch all historical diagnoses for a user.
- `POST /npk-reading`: Ingest NPK sensor reading directly via REST.
