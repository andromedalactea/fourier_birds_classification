"""FastAPI service for bird audio classification."""

from __future__ import annotations

import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.config import CORS_ORIGINS, MAX_UPLOAD_BYTES, MODEL_PATH  # noqa: E402
from lib.predictor import BirdPredictor, format_species_display  # noqa: E402

predictor: BirdPredictor | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global predictor
    predictor = BirdPredictor(model_path=MODEL_PATH)
    yield
    predictor = None


app = FastAPI(
    title="Aves Sonoras API",
    description="Identificación de aves por firma sonora",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    n_species: int
    model_path: str


class PredictionItem(BaseModel):
    rank: int
    species: str
    display_name: str
    probability: float


class PredictionMeta(BaseModel):
    feature_dim: int
    clip_seconds: float
    sample_rate: int


class PredictionResponse(BaseModel):
    predictions: list[PredictionItem]
    meta: PredictionMeta


class SpeciesItem(BaseModel):
    species: str
    display_name: str


class SpeciesResponse(BaseModel):
    species: list[SpeciesItem]
    count: int


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if predictor is None:
        raise HTTPException(status_code=503, detail="El modelo no está cargado.")
    return HealthResponse(
        status="ok",
        model_loaded=True,
        n_species=predictor.n_species,
        model_path=str(predictor.model_path),
    )


@app.get("/api/species", response_model=SpeciesResponse)
def list_species() -> SpeciesResponse:
    if predictor is None:
        raise HTTPException(status_code=503, detail="El modelo no está cargado.")
    items = [
        SpeciesItem(species=s, display_name=format_species_display(s))
        for s in predictor.classes
    ]
    return SpeciesResponse(species=items, count=len(items))


@app.post("/api/predict", response_model=PredictionResponse)
async def predict(
    audio: UploadFile = File(...),
    top_k: int = Query(default=5, ge=1, le=30),
) -> PredictionResponse:
    if predictor is None:
        raise HTTPException(status_code=503, detail="El modelo no está cargado.")

    if not audio.filename:
        raise HTTPException(status_code=400, detail="No se recibió ningún archivo de audio.")

    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="El archivo supera el límite de 15 MB.",
        )

    suffix = Path(audio.filename).suffix or ".bin"
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        result = predictor.predict(audio_path=temp_path, top_k=top_k)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo procesar el audio: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error al analizar el audio: {exc}",
        ) from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)

    return PredictionResponse(
        predictions=[
            PredictionItem(
                rank=p.rank,
                species=p.species,
                display_name=p.display_name,
                probability=p.probability,
            )
            for p in result.predictions
        ],
        meta=PredictionMeta(
            feature_dim=result.feature_dim,
            clip_seconds=result.clip_seconds,
            sample_rate=result.sample_rate,
        ),
    )
