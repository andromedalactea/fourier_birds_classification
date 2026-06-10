import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Central artifacts directory — swap models by replacing files here or overriding env vars.
DEFAULT_ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
ARTIFACTS_DIR = Path(os.getenv("ARTIFACTS_DIR", str(DEFAULT_ARTIFACTS_DIR)))
if not ARTIFACTS_DIR.is_absolute():
    ARTIFACTS_DIR = PROJECT_ROOT / ARTIFACTS_DIR

DEFAULT_MODEL_PATH = ARTIFACTS_DIR / "bird_fft_model.joblib"
DEFAULT_SPECIES_PATH = ARTIFACTS_DIR / "species_label_encoder.json"
DEFAULT_MANIFEST_PATH = ARTIFACTS_DIR / "manifest.json"
DEFAULT_SPECTRA_PATH = ARTIFACTS_DIR / "species_spectra.json"
DEFAULT_STATIC_DIR = PROJECT_ROOT / "web" / "dist"

MAX_UPLOAD_BYTES = 15 * 1024 * 1024

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]


def _resolve_path(env_name: str, default: Path) -> Path:
    value = os.getenv(env_name)
    if not value:
        return default
    path = Path(value)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


MODEL_PATH = _resolve_path("MODEL_PATH", DEFAULT_MODEL_PATH)
SPECIES_PATH = _resolve_path("SPECIES_PATH", DEFAULT_SPECIES_PATH)
MANIFEST_PATH = _resolve_path("MANIFEST_PATH", DEFAULT_MANIFEST_PATH)
SPECTRA_PATH = _resolve_path("SPECTRA_PATH", DEFAULT_SPECTRA_PATH)
STATIC_DIR = _resolve_path("STATIC_DIR", DEFAULT_STATIC_DIR)


def load_manifest() -> dict | None:
    if not MANIFEST_PATH.exists():
        return None
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_species_spectra() -> dict | None:
    if not SPECTRA_PATH.exists():
        return None
    with SPECTRA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)
