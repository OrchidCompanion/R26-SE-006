from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import plants, sensors, auth

app = FastAPI(
    title="OrchidCompanion API",
    description="API for React Web, React Native, and ESP32 orchid management system.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(plants.router)
app.include_router(sensors.router)


@app.get("/api/health", tags=["Health Check"])
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }