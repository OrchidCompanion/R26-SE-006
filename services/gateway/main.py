import os
from typing import Dict
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="OrchidCompanion API Gateway",
    description="Unified API Gateway routing traffic to microservices",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SPECIES_SERVICE_URL = os.getenv("SPECIES_SERVICE_URL", "http://localhost:7860")
DISEASE_SERVICE_URL = os.getenv("DISEASE_SERVICE_URL", "http://localhost:7861")
FLOWERING_SERVICE_URL = os.getenv("FLOWERING_SERVICE_URL", "http://localhost:7862")
FERTILIZER_SERVICE_URL = os.getenv("FERTILIZER_SERVICE_URL", "http://localhost:7863")
PLACEMENT_SERVICE_URL = os.getenv("PLACEMENT_SERVICE_URL", "http://localhost:7864")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:7865")
LEGACY_BACKEND_URL = os.getenv("LEGACY_BACKEND_URL", "https://r26-se-006.onrender.com")

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
    "host",
}


def clean_headers(headers: Dict[str, str]) -> Dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP_HEADERS}


async def forward_request(
    target_base_url: str, target_path: str, request: Request, timeout: float = 120.0
) -> Response:
    """Streamlined reverse proxy function that forwards raw HTTP requests to microservices."""
    url = f"{target_base_url.rstrip('/')}/{target_path.lstrip('/')}"
    headers = clean_headers(dict(request.headers))
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                params=request.query_params,
                content=body,
            )

            response_headers = clean_headers(dict(resp.headers))
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=response_headers,
                media_type=resp.headers.get("content-type"),
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Target service at {target_base_url} is unreachable or offline.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Target service at {target_base_url} timed out.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gateway proxy error: {str(e)}",
        )


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "service": "OrchidCompanion API Gateway",
        "status": "healthy",
        "routes": {
            "auth": AUTH_SERVICE_URL,
            "species": SPECIES_SERVICE_URL,
            "disease": DISEASE_SERVICE_URL,
            "flowering": FLOWERING_SERVICE_URL,
            "fertilizer": FERTILIZER_SERVICE_URL,
            "placement": PLACEMENT_SERVICE_URL,
            "legacy_backend": LEGACY_BACKEND_URL,
        },
    }


# ==============================================================================
# MICROSERVICE ROUTES
# ==============================================================================

# 0. Authentication Microservice (Self-hosted)
@app.api_route(
    "/auth/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Auth Service"],
)
@app.api_route(
    "/api/auth/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Auth Service"],
)
async def route_auth(path: str, request: Request):
    """Routes directly to Authentication & User Microservice."""
    return await forward_request(AUTH_SERVICE_URL, f"/{path}", request)


# 1. Species Identification & Plants Catalog Microservice
@app.api_route(
    "/species/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Species Service"],
)
@app.api_route(
    "/api/species/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Species Service"],
)
async def route_species(path: str, request: Request):
    """Routes directly to Species Identification Microservice."""
    return await forward_request(SPECIES_SERVICE_URL, f"/identify" if path == "identify" else f"/{path}", request)


@app.api_route(
    "/plants/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Species Service"],
)
@app.api_route(
    "/api/plants/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Species Service"],
)
async def route_plants(path: str, request: Request):
    """Routes plant registry requests directly to Species & Plants Microservice."""
    return await forward_request(SPECIES_SERVICE_URL, f"/plants/{path}" if path else "/plants", request)


# 2. Disease & Treatment Microservice
@app.api_route(
    "/disease/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Disease Service"],
)
@app.api_route(
    "/api/disease/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Disease Service"],
)
async def route_disease(path: str, request: Request):
    """Routes directly to Disease & Treatment Microservice."""
    return await forward_request(DISEASE_SERVICE_URL, f"/{path}", request)


# 3. Flowering Lifecycle Microservice
@app.api_route(
    "/bloom/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Flowering Service"],
)
@app.api_route(
    "/api/bloom/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Flowering Service"],
)
async def route_flowering(path: str, request: Request):
    """Routes directly to Flowering Lifecycle Microservice."""
    return await forward_request(FLOWERING_SERVICE_URL, f"/{path}", request)


# 4. Growth Stage & Fertilizer Microservice
@app.api_route(
    "/fertilizer/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Fertilizer Service"],
)
@app.api_route(
    "/api/fertilizer/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Fertilizer Service"],
)
async def route_fertilizer(path: str, request: Request):
    """Routes directly to Growth Stage & Fertilizer Microservice."""
    return await forward_request(FERTILIZER_SERVICE_URL, f"/{path}", request)


# 5. Plant Placement Analysis & Sensors Microservice
@app.api_route(
    "/locations/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Placement Service"],
)
@app.api_route(
    "/api/locations/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Placement Service"],
)
async def route_locations(path: str, request: Request):
    """Routes directly to Plant Placement Analysis Microservice."""
    return await forward_request(PLACEMENT_SERVICE_URL, f"/locations/{path}" if path else "/locations", request)


@app.api_route(
    "/sensors/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Placement Service"],
)
@app.api_route(
    "/api/sensors/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Placement Service"],
)
async def route_sensors(path: str, request: Request):
    """Routes directly to Plant Placement Analysis Microservice (Modules & Ambient Telemetry)."""
    return await forward_request(PLACEMENT_SERVICE_URL, f"/modules/{path.replace('modules/', '')}" if path.startswith("modules/") else f"/{path}", request)



# 6. Fallback route
@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    tags=["Legacy Backend Fallback"],
)
async def route_fallback(path: str, request: Request):
    """Routes any unassigned routes to legacy backend fallback."""
    return await forward_request(LEGACY_BACKEND_URL, f"/api/{path}", request)

