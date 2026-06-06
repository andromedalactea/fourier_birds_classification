"""Bird species prediction from audio files."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np


DEFAULT_ARTIFACTS_DIR = "artifacts"
DEFAULT_MODEL_FILE = "bird_fft_model.joblib"
DEFAULT_SPECIES_FILE = "species_label_encoder.json"


def format_species_display(species: str) -> str:
    return species.replace("_", " ")


def _resolve_artifact_path(
    env_name: str,
    default_relative: str,
    project_root: Path,
) -> Path:
    value = os.getenv(env_name)
    if value:
        path = Path(value)
        return path if path.is_absolute() else project_root / path

    artifacts_dir = os.getenv("ARTIFACTS_DIR", DEFAULT_ARTIFACTS_DIR)
    artifacts_path = Path(artifacts_dir)
    if not artifacts_path.is_absolute():
        artifacts_path = project_root / artifacts_path
    return artifacts_path / default_relative


def load_species_classes(species_path: Path) -> list[str]:
    with species_path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    classes = data.get("classes")
    if not isinstance(classes, list) or not classes:
        raise ValueError(f"Invalid species file (missing 'classes'): {species_path}")
    return [str(item) for item in classes]


@dataclass
class Prediction:
    rank: int
    species: str
    display_name: str
    probability: float


@dataclass
class PredictionResult:
    predictions: list[Prediction]
    feature_dim: int
    clip_seconds: float
    sample_rate: int


class BirdPredictor:
    def __init__(
        self,
        model_path: str | Path | None = None,
        species_path: str | Path | None = None,
    ) -> None:
        project_root = Path(__file__).resolve().parent.parent

        path = (
            Path(model_path)
            if model_path
            else _resolve_artifact_path("MODEL_PATH", DEFAULT_MODEL_FILE, project_root)
        )
        if not path.is_absolute():
            path = project_root / path

        if not path.exists():
            raise FileNotFoundError(f"Model bundle not found: {path}")

        species_file = (
            Path(species_path)
            if species_path
            else _resolve_artifact_path("SPECIES_PATH", DEFAULT_SPECIES_FILE, project_root)
        )
        if not species_file.is_absolute():
            species_file = project_root / species_file

        bundle = joblib.load(path)
        self.model_path = path
        self.species_path = species_file if species_file.exists() else None
        self.model = bundle["model"]
        self.classes: list[str] = bundle["classes"]
        self.feature_config: dict = bundle["feature_config"]

        if self.species_path is not None:
            species_classes = load_species_classes(self.species_path)
            if species_classes != self.classes:
                raise ValueError(
                    "Species file does not match model classes. "
                    f"model={len(self.classes)}, species_file={len(species_classes)}"
                )

    @property
    def n_species(self) -> int:
        return len(self.classes)

    def predict(self, audio_path: str, top_k: int = 5) -> PredictionResult:
        from lib.audio_features import audio_to_feature

        config = self.feature_config
        feature = audio_to_feature(
            audio_path=audio_path,
            sample_rate=config["sample_rate"],
            clip_seconds=config["clip_seconds"],
        )
        probabilities = self.model.predict_proba(feature.reshape(1, -1))[0]
        sorted_idx = np.argsort(probabilities)[::-1][:top_k]

        predictions: list[Prediction] = []
        for rank, idx in enumerate(sorted_idx, start=1):
            class_id = int(self.model.classes_[idx])
            species = self.classes[class_id]
            predictions.append(
                Prediction(
                    rank=rank,
                    species=species,
                    display_name=format_species_display(species),
                    probability=float(probabilities[idx]),
                )
            )

        return PredictionResult(
            predictions=predictions,
            feature_dim=int(feature.shape[0]),
            clip_seconds=float(config["clip_seconds"]),
            sample_rate=int(config["sample_rate"]),
        )
