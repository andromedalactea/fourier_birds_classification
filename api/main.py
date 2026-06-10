"""FastAPI service for bird audio classification."""

from __future__ import annotations

import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.config import (  # noqa: E402
    CORS_ORIGINS,
    MANIFEST_PATH,
    MAX_UPLOAD_BYTES,
    MODEL_PATH,
    SPECTRA_PATH,
    SPECIES_PATH,
    STATIC_DIR,
    load_manifest,
    load_species_spectra,
)
from lib.predictor import BirdPredictor, format_species_display  # noqa: E402

predictor: BirdPredictor | None = None
species_spectra: dict | None = None
_spectra_mtime: float | None = None


def get_species_spectra() -> dict | None:
    """Return cached species spectra, reloading when the file changes on disk."""
    global species_spectra, _spectra_mtime
    if not SPECTRA_PATH.exists():
        species_spectra = None
        _spectra_mtime = None
        return None
    mtime = SPECTRA_PATH.stat().st_mtime
    if species_spectra is None or _spectra_mtime != mtime:
        species_spectra = load_species_spectra()
        _spectra_mtime = mtime
    return species_spectra


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global predictor
    predictor = BirdPredictor(model_path=MODEL_PATH, species_path=SPECIES_PATH)
    get_species_spectra()
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
    species_path: str | None
    manifest_path: str | None
    model_version: str | None


class PredictionItem(BaseModel):
    rank: int
    species: str
    display_name: str
    probability: float


class PredictionMeta(BaseModel):
    feature_dim: int
    clip_seconds: float
    sample_rate: int


class SpectrumPeak(BaseModel):
    freq_hz: float
    magnitude: float


class SpectrumProfileModel(BaseModel):
    spectrum: list[float]
    peaks: list[SpectrumPeak]
    freq_max_hz: float
    n_bins: int


class SpectrumComparison(BaseModel):
    audio: SpectrumProfileModel | None
    species: dict[str, SpectrumProfileModel]


class PredictionResponse(BaseModel):
    predictions: list[PredictionItem]
    meta: PredictionMeta
    spectrum: SpectrumComparison | None = None


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

    manifest = load_manifest()
    return HealthResponse(
        status="ok",
        model_loaded=True,
        n_species=predictor.n_species,
        model_path=str(predictor.model_path),
        species_path=str(predictor.species_path) if predictor.species_path else None,
        manifest_path=str(MANIFEST_PATH) if MANIFEST_PATH.exists() else None,
        model_version=manifest.get("version") if manifest else None,
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


def _species_spectrum_profile(species: str) -> SpectrumProfileModel | None:
    spectra = get_species_spectra()
    if not spectra:
        return None
    entry = spectra.get("species", {}).get(species)
    if not entry:
        return None
    return SpectrumProfileModel(
        spectrum=entry["spectrum"],
        peaks=[SpectrumPeak(**peak) for peak in entry["peaks"]],
        freq_max_hz=float(spectra.get("freq_max_hz", 11025.0)),
        n_bins=int(spectra.get("n_bins", len(entry["spectrum"]))),
    )


@app.get("/api/spectra", response_model=SpectrumComparison)
def get_spectra(
    species: str = Query(..., description="Comma-separated species identifiers"),
) -> SpectrumComparison:
    requested = [item.strip() for item in species.split(",") if item.strip()]
    profiles = {
        name: profile
        for name in requested
        if (profile := _species_spectrum_profile(name)) is not None
    }
    return SpectrumComparison(audio=None, species=profiles)


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

        result = predictor.predict(
            audio_path=temp_path, top_k=top_k, include_spectrum=True
        )
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

    audio_profile: SpectrumProfileModel | None = None
    if result.audio_spectrum:
        audio_profile = SpectrumProfileModel(**result.audio_spectrum)

    candidate_profiles = {
        p.species: profile
        for p in result.predictions
        if (profile := _species_spectrum_profile(p.species)) is not None
    }

    spectrum: SpectrumComparison | None = None
    if audio_profile or candidate_profiles:
        spectrum = SpectrumComparison(
            audio=audio_profile,
            species=candidate_profiles,
        )

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
        spectrum=spectrum,
    )


if STATIC_DIR.is_dir():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)

        index_file = STATIC_DIR / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)

        raise HTTPException(status_code=404, detail="Frontend build not found")
