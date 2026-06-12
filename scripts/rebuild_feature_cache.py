#!/usr/bin/env python3
"""Rebuild a 210-dim feature cache from used_records via Xeno-Canto."""

from __future__ import annotations

import json
import os
import random
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.train_bird_fft_classifier import (  # noqa: E402
    API_URL,
    build_session,
    download_temp_audio,
    get_api_key,
    log,
)
from lib.audio_features import audio_to_feature  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env", override=True)


def stratified_sample(records, max_total, seed):
    by_species = defaultdict(list)
    for rec in records:
        by_species[rec["species"]].append(rec)

    rng = random.Random(seed)
    per_species = max(2, max_total // len(by_species))
    selected = []
    for species, items in sorted(by_species.items()):
        rng.shuffle(items)
        selected.extend(items[:per_species])
    rng.shuffle(selected)
    return selected[:max_total]


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--records-path", default="develop-eggs/artifacts/used_records.json")
    parser.add_argument("--output", default="/tmp/benchmark_features_210.npz")
    parser.add_argument("--max-records", type=int, default=450)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--sample-rate", type=int, default=22050)
    parser.add_argument("--clip-seconds", type=float, default=12.0)
    parser.add_argument("--timeout", type=float, default=40.0)
    args = parser.parse_args()

    records_path = PROJECT_ROOT / args.records_path
    records = json.loads(records_path.read_text(encoding="utf-8"))
    selected = stratified_sample(records, max_total=args.max_records, seed=args.seed)
    log(f"Selected {len(selected)} records across species for 210-dim re-extraction.")

    env_name, api_key = get_api_key()
    if not api_key:
        raise SystemExit("Missing XENO_CANTO_API_KEY or XC_API_KEY in .env")

    session = build_session(total_retries=3)
    metadata_cache = {}

    def fetch_recording_by_id(rec_id):
        rec_id = str(rec_id)
        if rec_id in metadata_cache:
            return metadata_cache[rec_id]
        response = session.get(
            API_URL,
            params={"query": f"nr:{rec_id}", "key": api_key},
            timeout=args.timeout,
        )
        if response.status_code != 200:
            metadata_cache[rec_id] = None
            return None
        recordings = response.json().get("recordings", [])
        meta = recordings[0] if recordings else None
        metadata_cache[rec_id] = meta
        return meta

    features = []
    labels = []
    failed = 0

    with tempfile.TemporaryDirectory(prefix="bird_bench_audio_") as temp_dir:
        for idx, rec in enumerate(selected, start=1):
            rec_id = str(rec["id"])
            species = rec["species"]
            meta = fetch_recording_by_id(rec_id)
            if not meta or not meta.get("file"):
                failed += 1
                log(f"[{idx}/{len(selected)}] Missing metadata for id={rec_id}")
                continue

            audio_path = None
            try:
                audio_path = download_temp_audio(
                    session=session,
                    url=meta["file"],
                    timeout=args.timeout,
                    temp_dir=temp_dir,
                )
                feature = audio_to_feature(
                    audio_path=audio_path,
                    sample_rate=args.sample_rate,
                    clip_seconds=args.clip_seconds,
                )
                features.append(feature)
                labels.append(species)
                if idx % 25 == 0:
                    log(f"Progress {idx}/{len(selected)} ok={len(features)} failed={failed}")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                log(f"[{idx}/{len(selected)}] Failed id={rec_id}: {exc}")
            finally:
                if audio_path and os.path.exists(audio_path):
                    os.remove(audio_path)

    if not features:
        raise SystemExit("No features extracted.")

    X = np.vstack(features)
    y = np.array(labels)
    output_path = Path(args.output)
    np.savez_compressed(output_path, X=X, y=y)
    log(f"Saved {X.shape} features to {output_path} (failed={failed})")


if __name__ == "__main__":
    main()
