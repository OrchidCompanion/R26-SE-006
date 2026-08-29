import os
from pathlib import Path

# Paths relative to model_train_IT22190598
MODULE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MODULE_DIR.parent
IT_DIR = BACKEND_DIR.parent
WORKSPACE_ROOT = IT_DIR.parent

def find_model_file(filename: str) -> str:
    """Search candidate locations for model files."""
    candidates = [
        MODULE_DIR / "models" / filename,
        BACKEND_DIR / "app" / "models" / filename,
        BACKEND_DIR / "models" / filename,
        IT_DIR / "models" / filename,
        IT_DIR / filename,
        WORKSPACE_ROOT / filename,
        Path(r"C:\Users\SN Gamalath\Downloads") / filename,
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return str(MODULE_DIR / "models" / filename)

MODEL01_PATH = os.getenv("MODEL01_PATH", find_model_file("checkpoint_best_total.pth"))
MODEL02_PATH = os.getenv("MODEL02_PATH", find_model_file("gradient_boosting_experiment.joblib"))

# Sensitive Supabase Credentials loaded from .env
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Model 01 Settings
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))

# File upload restrictions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# Exact 5 Blooming Stages
BLOOMING_STAGES = [
    "Seedling",
    "Vegetative",
    "Mature_Pseudobulb",
    "Bud_formation",
    "Flowering"
]

# Progression mapping
NEXT_STAGE_MAP = {
    "Seedling": "Vegetative",
    "Vegetative": "Mature_Pseudobulb",
    "Mature_Pseudobulb": "Bud_formation",
    "Bud_formation": "Flowering",
    "Flowering": None
}

# Blooming Stage Class Index Mapping (matches checkpoint_best_total.pth RF-DETR classes)
# Class names: ['Bud_formation', 'Flowering', 'Mature_Pseudobulb', 'Seedling', 'Vegetative']
STAGE_CLASS_MAP = {
    0: "Bud_formation",
    1: "Flowering",
    2: "Mature_Pseudobulb",
    3: "Seedling",
    4: "Vegetative"
}

# Alias for backwards compatibility
YOLO_CLASS_MAP = STAGE_CLASS_MAP

# Model 02 Exact Feature Order (15 features expected by trained pipeline)
MODEL02_FEATURE_ORDER = [
    "current_stage",
    "month",
    "day_of_year",
    "avg_temp_c",
    "min_temp_c",
    "max_temp_c",
    "temp_std_c",
    "avg_humidity_rh",
    "min_humidity_rh",
    "max_humidity_rh",
    "humidity_std_rh",
    "avg_light_lux",
    "min_light_lux",
    "max_light_lux",
    "light_std_lux"
]
