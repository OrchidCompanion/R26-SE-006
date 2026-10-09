# Orchid Growth Stage & Fertilizer Microservice (IT22085726)

This microservice handles **Leaf Physical Dimension Measurement**, **Botanical Growth Stage Classification**, and **Stage-Specific NPK Fertilizer Balancing** for Dendrobium orchids:
- **Leaf & Coin Segmentation (YOLO)**: Detects the orchid leaf and a 2.3 cm reference coin to compute accurate real-world dimensions (length, width, surface area in cm²).
- **Growth Stage Prediction**: Classifies plant lifecycle stage (Seedling, Vegetative, Pre Flowering, Matured, Flowering) based on physical dimensions and leaf count.
- **NPK Formulation & Dosage Balancing**: Compares relative soil nutrient balance against stage targets (30-10-10 vegetative, 20-20-20 pre-flowering, 6-30-30 bloom booster) to output precise adjustment recommendations.
- **MQTT Telemetry Integration**: Subscribes to live soil NPK readings from the ESP32-S3 NPK Module.

---

## 1. Local Development (Without Docker)

1. Activate your virtual environment and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and set Member IT22085726's Supabase credentials.
3. Run the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 7863 --reload
   ```
4. Access interactive API documentation: [http://localhost:7863/docs](http://localhost:7863/docs)

---

## 2. Deploying to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space):
   - **Space Name**: e.g., `orchid-fertilizer-service`
   - **SDK**: **Docker** (Blank)
   - **Hardware**: CPU basic (2 vCPU, 16 GB RAM)
2. Push the files in this directory to the Space Git repository:
   - `Dockerfile`
   - `requirements.txt`
   - `main.py`
   - `database.py`
   - `model_service.py`
   - `recommendation_engine.py`
   - `mqtt_consumer.py`
   - `models/` (`leaf_segmentation_best.pt`, `growth_stage_model.pkl`, `label_encoder.pkl`)
3. Under **Space Settings -> Secrets**, add:
   - `FERTILIZER_SUPABASE_URL`: Your Supabase URL
   - `FERTILIZER_SUPABASE_KEY`: Your Supabase Anon or Service Role key
   - `MQTT_BROKER_HOST`: Your cloud broker host (e.g. HiveMQ / EMQX)
4. Once deployed, the service is accessible at:
   `https://<your-username>-orchid-fertilizer-service.hf.space`

---

## 3. API Endpoints

- `POST /analyze` (or `/api/fertilizer/analyze`): Upload leaf image and leaf count for segmentation, stage classification, and NPK recommendation.
- `GET /requirements`: Retrieve user fertilizer schedule and dosage logs.
- `GET /plant/{plant_id}`: Retrieve fertilizer recommendations for a specific plant.
- `POST /npk-reading`: Ingest soil NPK reading directly via REST.
