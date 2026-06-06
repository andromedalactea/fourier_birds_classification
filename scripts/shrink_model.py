"""Shrink a trained ExtraTrees bundle for low-memory deploy targets (e.g. Render free)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sklearn.ensemble import ExtraTreesClassifier


def shrink_bundle(bundle: dict, n_estimators: int) -> dict:
    model = bundle["model"]
    if not isinstance(model, ExtraTreesClassifier):
        raise TypeError(f"Expected ExtraTreesClassifier, got {type(model).__name__}")

    total = len(model.estimators_)
    if n_estimators > total:
        raise ValueError(f"n_estimators={n_estimators} exceeds trained trees ({total})")

    small = ExtraTreesClassifier(n_estimators=n_estimators)
    small.estimators_ = model.estimators_[:n_estimators]
    small.classes_ = model.classes_
    small.n_classes_ = model.n_classes_
    small.n_features_in_ = model.n_features_in_
    small.n_outputs_ = model.n_outputs_
    small.n_estimators = n_estimators

    return {
        "model": small,
        "classes": bundle["classes"],
        "feature_config": bundle["feature_config"],
        "created_at": bundle.get("created_at"),
        "deploy_shrunk_from": total,
        "deploy_n_estimators": n_estimators,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Shrink bird_fft_model.joblib for deploy.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--n-estimators", type=int, default=80)
    parser.add_argument("--compress", type=int, default=3)
    args = parser.parse_args()

    bundle = joblib.load(args.input)
    shrunk = shrink_bundle(bundle, args.n_estimators)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(shrunk, args.output, compress=args.compress)

    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "n_estimators": args.n_estimators,
                "trained_estimators": shrunk["deploy_shrunk_from"],
                "size_mb": round(size_mb, 2),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
