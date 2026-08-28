import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add backend directory to sys.path so app package resolves cleanly
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from app.api.routes import router as api_router
from app.services.model01_service import get_model01_service
from app.services.model02_service import get_model02_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload ML models ONCE at server startup."""
    print("=" * 60)
    print("  DENDROBIUM BLOOM PREDICTION SYSTEM — STARTING SERVER")
    print("=" * 60)
    try:
        print("[Startup] Initializing Model 01 (best.pt)...")
        get_model01_service()
        print("[Startup] Initializing Model 02 (gradient_boosting_experiment.joblib)...")
        get_model02_service()
        print("[Startup] All models preloaded successfully.")
    except Exception as e:
        print(f"[CRITICAL ERROR] Failed to load models during startup: {e}")
    yield
    print("[Shutdown] Cleaning up server resources...")

app = FastAPI(
    title="Dendrobium Orchid Bloom Prediction API",
    description="AI-powered blooming stage identification (YOLOv8) and bloom transition duration prediction (Gradient Boosting)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routes
app.include_router(api_router)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to return clean user-facing error messages."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred while processing your request. Please try again or check uploaded image clarity."
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
