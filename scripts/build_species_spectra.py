"""Build per-species Fourier spectrum profiles for the comparison feature.

Downloads a few Xeno-Canto recordings per species (the same ones used to train
the deployed model, listed in used_records.json), computes their average
normalized magnitude spectrum + dominant frequency peaks, and writes
artifacts/species_spectra.json consumed by the API.

Usage:
    python scripts/build_species_spectra.py \
        [--records-per-species 4] [--force] \
        [--used-records develop-eggs/artifacts/used_records.json] \
        [--output artifacts/species_spectra.json]

The script is resumable: progress is saved after each species, and species
already present in the output file are skipped unless --force is given.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from lib.predictor import load_species_classes  # noqa: E402
from lib.spectrum import (  # noqa: E402
    SPECTRUM_N_BINS,
    SpectrumProfile,
    audio_to_spectrum,
    average_spectra,
)

DOWNLOAD_URL = "https://xeno-canto.org/{record_id}/download"
USER_AGENT = "fourier-birds-classification/1.0 (species spectra builder)"

DEFAULT_SAMPLE_RATE = 22050
DEFAULT_CLIP_SECONDS = 12.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--used-records",
        default=str(PROJECT_ROOT / "develop-eggs" / "artifacts" / "used_records.json"),
        help="JSON list of {id, species} records used for training.",
    )
    parser.add_argument(
        "--species-file",
        default=str(PROJECT_ROOT / "artifacts" / "species_label_encoder.json"),
        help="Species label encoder JSON (defines which species to build).",
    )
    parser.add_argument(
        "--output",
        default=str(PROJECT_ROOT / "artifacts" / "species_spectra.json"),
        help="Output JSON path.",
    )
    parser.add_argument("--records-per-species", type=int, default=4)
    parser.add_argument("--sample-rate", type=int, default=DEFAULT_SAMPLE_RATE)
    parser.add_argument("--clip-seconds", type=float, default=DEFAULT_CLIP_SECONDS)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute species already present in the output file.",
    )
    return parser.parse_args()


def load_existing(output_path: Path) -> dict:
    if output_path.exists():
        with output_path.open(encoding="utf-8") as handle:
            return json.load(handle)
    return {}


def save_output(output_path: Path, payload: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    tmp_path.replace(output_path)


def download_recording(
    session: requests.Session, record_id: str, timeout: int, temp_dir: str
) -> str:
    response = session.get(
        DOWNLOAD_URL.format(record_id=record_id),
        timeout=timeout,
        stream=True,
        allow_redirects=True,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Download failed with status {response.status_code}")

    with tempfile.NamedTemporaryFile(
        suffix=".mp3", dir=temp_dir, delete=False
    ) as tmp_file:
        for chunk in response.iter_content(chunk_size=1 << 15):
            if chunk:
                tmp_file.write(chunk)
        return tmp_file.name


def build_species_profile(
    session: requests.Session,
    species: str,
    record_ids: list[str],
    args: argparse.Namespace,
) -> dict | None:
    profiles: list[SpectrumProfile] = []
    used_ids: list[str] = []

    with tempfile.TemporaryDirectory(prefix="bird_spectra_") as temp_dir:
        for record_id in record_ids:
            if len(profiles) >= args.records_per_species:
                break
            try:
                audio_path = download_recording(
                    session, record_id, args.timeout, temp_dir
                )
                profile = audio_to_spectrum(
                    audio_path,
                    sample_rate=args.sample_rate,
                    clip_seconds=args.clip_seconds,
                )
                profiles.append(profile)
                used_ids.append(record_id)
                print(f"    XC{record_id}: ok ({len(profiles)}/{args.records_per_species})")
            except Exception as exc:  # noqa: BLE001 - keep going on bad recordings
                print(f"    XC{record_id}: skipped ({exc})")

    if not profiles:
        return None

    freq_max_hz = args.sample_rate / 2.0
    averaged = average_spectra(profiles, freq_max_hz=freq_max_hz)
    return {
        "spectrum": averaged.spectrum,
        "peaks": averaged.peaks,
        "n_recordings": len(profiles),
        "record_ids": used_ids,
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)

    classes = load_species_classes(Path(args.species_file))
    with Path(args.used_records).open(encoding="utf-8") as handle:
        used_records = json.load(handle)

    records_by_species: dict[str, list[str]] = {}
    for record in used_records:
        records_by_species.setdefault(record["species"], []).append(str(record["id"]))

    existing = load_existing(output_path)
    species_data: dict[str, dict] = dict(existing.get("species", {}))

    payload = {
        "version": 1,
        "variant": "mean_log_magnitude_v1",
        "sample_rate": args.sample_rate,
        "clip_seconds": args.clip_seconds,
        "n_bins": SPECTRUM_N_BINS,
        "freq_max_hz": args.sample_rate / 2.0,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "species": species_data,
    }

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    pending = [
        s for s in classes if args.force or s not in species_data
    ]
    print(f"Species total: {len(classes)} | pending: {len(pending)}")

    failures: list[str] = []
    for i, species in enumerate(pending, start=1):
        record_ids = records_by_species.get(species, [])
        print(f"[{i}/{len(pending)}] {species} ({len(record_ids)} candidate recordings)")
        if not record_ids:
            print("    no recordings available, skipping")
            failures.append(species)
            continue

        profile = build_species_profile(session, species, record_ids, args)
        if profile is None:
            print("    FAILED: no usable recordings")
            failures.append(species)
            continue

        species_data[species] = profile
        payload["generated_at"] = datetime.now(timezone.utc).isoformat()
        save_output(output_path, payload)

    print(
        f"\nDone. {len(species_data)}/{len(classes)} species profiles "
        f"written to {output_path}"
    )
    if failures:
        print(f"Failed species ({len(failures)}): {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
