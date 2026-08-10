from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import plants, sensors

app = FastAPI(
    title="OrchidCompanion API",
    description="API for React Web, React Native, and ESP32 orchid management system.",
    version="1.0.0"
)

# Enable CORS for React Web, Mobile App, and ESP32 requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(plants.router)
app.include_router(sensors.router)


@app.get("/api/health", tags=["Health Check"])
def health_check():
    """Health check endpoint to verify backend connectivity."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }