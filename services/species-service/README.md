# Orchid Species Identification Microservice (IT22140616)

This microservice handles orchid genus classification (**Dendrobium**, **Phalaenopsis**, and **Oncidium**) using an optimized YOLO object detection model and saves historical logs to Member IT22140616's Supabase database.

---

## 1. Local Development (Without Docker)

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
4. Run the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 7860 --reload
   ```
5. View API Docs: Open [http://localhost:7860/docs](http://localhost:7860/docs)

---

## 2. Deploying to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space):
   - **Space Name**: e.g., `orchid-species-service`
   - **SDK**: **Docker** (Blank)
   - **Hardware**: Free CPU basic (2 vCPU, 16 GB RAM)
2. Add your repository files to the Hugging Face Space Git repository:
   - `Dockerfile`
   - `requirements.txt`
   - `main.py`
   - `database.py`
   - `models/species-identification.pt`
3. In Hugging Face Space **Settings -> Variables and secrets**:
   - `SPECIES_SUPABASE_URL`: Your Supabase URL
   - `SPECIES_SUPABASE_KEY`: Your Supabase service role or anon key
4. Once built, the Space URL will be:
   `https://<your-username>-orchid-species-service.hf.space`

---

## 3. API Endpoints

- `GET /health`: Health and model status.
- `GET /species/info`: Plant anatomical and care guidelines for each recognized species.
- `POST /identify`: Multipart form with 1–5 image files.
- `GET /history?user_id=...`: Retrieval of past identifications for a user.
