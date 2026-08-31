import os
from typing import List
import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from utils.auth import get_current_user

router = APIRouter(prefix="/api/species", tags=["Species Identification"])
ML_SERVICE_URL = os.getenv("ML_SERVICE_URL")


@router.post("/identify")
async def identify_orchid_species(
    files: List[UploadFile] = File(...),
    conf_threshold: float = 0.35,
    current_user: dict = Depends(get_current_user),
):
    multipart_files = [
        ("files", (f.filename, await f.read(), f.content_type or "image/jpeg"))
        for f in files
    ]
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{ML_SERVICE_URL}/predict/species",
            files=multipart_files,
            params={"conf_threshold": conf_threshold},
        )
        res.raise_for_status()
        return res.json()
