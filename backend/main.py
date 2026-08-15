from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    auth,
    plants,
    locations,
    sensors,
    dht11,
    bh1750,
    npk,
    bloom,
    disease,
    fertilizer,
)

app = FastAPI(
    title="OrchidCompanion API",
    description="API for React Web, React Native, and ESP32 orchid management system.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(plants.router)
app.include_router(locations.router)
app.include_router(sensors.router)
app.include_router(dht11.router)
app.include_router(bh1750.router)
app.include_router(npk.router)
app.include_router(bloom.router)
app.include_router(disease.router)
app.include_router(fertilizer.router)


@app.get("/api/health", tags=["Health Check"])
def health_check():
    """Public health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
