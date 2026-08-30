import os
from typing import List
import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from utils.auth import get_current_user

router = APIRouter(prefix="/api/species", tags=["Species Identification"])

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "https://dinukarathnayake-orchid-inference.hf.space")
HF_TOKEN = os.getenv("HF_TOKEN")

@router.post("/identify")
async def identify_orchid_species(
    files: List[UploadFile] = File(
        ..., description="Upload 1 to 5 images for batch detection"
    ),
    conf_threshold: float = 0.60,
    current_user: dict = Depends(get_current_user),
):
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    # Convert uploaded files into multipart payload for Cloud Run
    multipart_files = []
    for file in files:
        content = await file.read()
        multipart_files.append(
            ("files", (file.filename, content, file.content_type or "image/jpeg"))
        )

    # Forward to Google Cloud Run (60s timeout accommodates cold starts)
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{ML_SERVICE_URL}/predict",
                files=multipart_files,
                params={"conf_threshold": conf_threshold},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"Inference Service Error: {exc.response.text}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Could not connect to ML service: {str(e)}",
            )