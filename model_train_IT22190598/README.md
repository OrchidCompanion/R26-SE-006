# AI-Powered Dendrobium Orchid Bloom Prediction System

A full-stack, professional web application designed to identify the current blooming stage of a **Dendrobium orchid** from uploaded images and predict its future blooming stage progression, transition durations, and estimated flowering date.

---

## 1. Project Overview

The system automates orchid bloom forecasting using a two-stage machine learning workflow:
- **Model 01 (Computer Vision)**: Analyzes 3 uploaded photos of the orchid to identify its current blooming stage state using confidence-weighted majority voting.
- **Model 02 (Environmental Regression)**: Takes the current stage along with IoT environmental sensor readings (temperature, humidity, light intensity, and date features) to forecast stage transition durations and calculate the estimated flowering date.

---

## 2. System Architecture

```
[User Interface (React + Vite)]
            │
            ▼ (HTTP REST API)
[FastAPI Backend Server (app/main.py)]
            │
    ┌───────┴────────────────────────┐
    ▼                                ▼
[Model 01 Service]         [Model 02 Service]
  (best.pt - YOLOv8)        (gradient_boosting_experiment.joblib)
    │                                │
    ▼                                ▼
[Current Stage] ───────────► [Transition Duration]
                                     │
                                     ▼
                            [Blooming Timeline]
                                     │
                                     ▼
                        [Estimated Flowering Date]
```

---

## 3. Machine Learning Models

### Model 01: Blooming Stage Identification
- **Algorithm**: YOLOv8 (Computer Vision Classification / Detection)
- **Model File**: `best.pt`
- **Purpose**: Detect blooming stage from 3 user-uploaded images.
- **Class Mapping**:
  - Class 0: `Bud_formation`
  - Class 1: `Flowering`
  - Class 2: `Mature_Cane` → Mapped to `Mature_Pseudobulb`
  - Class 3: `Seedling`
  - Class 4: `Vegetative`

### Model 02: Bloom Transition Duration Prediction
- **Algorithm**: Scikit-Learn Gradient Boosting Regressor Pipeline
- **Model File**: `gradient_boosting_experiment.joblib`
- **Purpose**: Predict transition duration (in days) between consecutive blooming stages.
- **15 Exact Feature Vector (Ordered)**:
  1. `current_stage` (categorical: `Seedling`, `Vegetative`, `Mature_Pseudobulb`, `Bud_formation`)
  2. `month` (1–12)
  3. `day_of_year` (1–366)
  4. `avg_temp_c` (°C)
  5. `min_temp_c` (°C)
  6. `max_temp_c` (°C)
  7. `temp_std_c` (°C)
  8. `avg_humidity_rh` (%)
  9. `min_humidity_rh` (%)
  10. `max_humidity_rh` (%)
  11. `humidity_std_rh` (%)
  12. `avg_light_lux` (Lux)
  13. `min_light_lux` (Lux)
  14. `max_light_lux` (Lux)
  15. `light_std_lux` (Lux)

---

## 4. Blooming Stages Progression Sequence

```
Seedling ──► Vegetative ──► Mature_Pseudobulb ──► Bud_formation ──► Flowering
```

If the identified current stage is **Flowering**, the system identifies this terminal state and displays *"Your Dendrobium orchid is currently flowering."* without invoking Model 02.

---

## 5. Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 18+ & npm

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd model_train_IT22190598/backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Verify model files (`best.pt` and `gradient_boosting_experiment.joblib`) are present in `model_train_IT22190598/backend/app/models/` or root workspace directory.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd model_train_IT22190598/frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

---

## 6. How to Run the Application

### Option A: Run Backend & Frontend Separately

1. **Start FastAPI Backend**:
   ```bash
   cd model_train_IT22190598/backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   API Server will run at: `http://localhost:8000`  
   Interactive API Docs: `http://localhost:8000/docs`

2. **Start React Frontend**:
   ```bash
   cd model_train_IT22190598/frontend
   npm run dev
   ```
   Web Application will open at: `http://localhost:5173`

---

## 7. API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | System health check |
| `POST` | `/api/v1/detect-stage` | Receives 3 images and returns Model 01 stage classification |
| `POST` | `/api/v1/predict-transition` | Runs Model 02 with 15 IoT sensor features for transition duration |
| `POST` | `/api/v1/predict-bloom` | Runs complete 3-image stage + timeline + flowering date workflow |
| `POST` | `/api/v1/parse-sensor-data` | Utility to upload and parse raw CSV/JSON IoT sensor logs |

---

## 8. Running Automated Tests

Run backend unit and integration test suite:
```bash
cd model_train_IT22190598/backend
python -m pytest tests/ -v
```

---

## 9. Prediction Workflow Summary

1. User opens the application at `http://localhost:5173`.
2. User uploads **three photos** of the same Dendrobium orchid.
3. Model 01 processes each image using YOLOv8 `best.pt` and applies confidence-weighted majority voting to determine `current_stage`.
4. User selects or inputs IoT environmental sensor parameters (temperature, humidity, light lux, and date features) or selects a quick environment preset.
5. Model 02 (`gradient_boosting_experiment.joblib`) predicts transition duration to the next stage.
6. The system calculates the estimated date for the next stage using calendar date arithmetic.
7. The system continues prediction step-by-step through remaining stages up to **Flowering**.
8. The dashboard displays the complete blooming timeline and prominent **Estimated Flowering Date**.
