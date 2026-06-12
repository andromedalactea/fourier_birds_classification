#!/usr/bin/env python3
"""Compare bird-classifier algorithms on the same train/validation split."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from math import ceil
from pathlib import Path
from time import perf_counter

import numpy as np
from sklearn.base import clone
from sklearn.ensemble import (
    AdaBoostClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import SVC

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@dataclass
class BenchmarkResult:
    name: str
    accuracy: float
    top3_accuracy: float
    macro_f1: float
    train_seconds: float
    feature_dims: int
    notes: str = ""


def top_k_accuracy(model, X, y_true, k=3):
    probabilities = model.predict_proba(X)
    top_k_indices = np.argsort(probabilities, axis=1)[:, -k:]
    hits = sum(
        1
        for row_idx, true_value in enumerate(y_true)
        if true_value in top_k_indices[row_idx]
    )
    return hits / len(y_true)


def filter_classes_for_split(X, y_text):
    from collections import Counter

    counts = Counter(y_text.tolist())
    keep = {label for label, count in counts.items() if count >= 2}
    mask = np.array([label in keep for label in y_text], dtype=bool)
    X_filtered = X[mask]
    y_filtered = y_text[mask]
    if len(np.unique(y_filtered)) < 2:
        raise RuntimeError("Need at least 2 species with >=2 samples each.")
    return X_filtered, y_filtered


def make_split(X, y_text, test_size, seed):
    X, y_text = filter_classes_for_split(X, y_text)
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_text)

    n_samples = len(y)
    n_classes = len(label_encoder.classes_)
    desired_test_count = max(int(ceil(n_samples * test_size)), n_classes)
    max_test_count = n_samples - n_classes
    if max_test_count < n_classes:
        raise RuntimeError("Not enough samples for stratified split.")
    if desired_test_count > max_test_count:
        desired_test_count = max_test_count

    adjusted_test_size = desired_test_count / n_samples
    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=adjusted_test_size,
        random_state=seed,
        stratify=y,
    )
    return X_train, X_val, y_train, y_val, label_encoder


def slice_features(X, variant):
    if variant == "full":
        return X
    if variant == "fourier_only":
        return X[:, :80]
    if variant == "mfcc_block":
        return X[:, 80:200]
    if variant == "spectral_summary":
        return X[:, 200:]
    raise ValueError(f"Unknown feature variant: {variant}")


def build_models(seed):
    models = [
        (
            "ExtraTrees (app default)",
            ExtraTreesClassifier(
                n_estimators=500,
                random_state=seed,
                n_jobs=-1,
                class_weight="balanced",
            ),
        ),
        (
            "RandomForest",
            RandomForestClassifier(
                n_estimators=300,
                random_state=seed,
                n_jobs=-1,
                class_weight="balanced_subsample",
            ),
        ),
        (
            "HistGradientBoosting",
            HistGradientBoostingClassifier(
                max_iter=200,
                random_state=seed,
                class_weight="balanced",
            ),
        ),
        (
            "GradientBoosting",
            GradientBoostingClassifier(random_state=seed),
        ),
        (
            "SVM (RBF)",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        SVC(
                            kernel="rbf",
                            probability=True,
                            random_state=seed,
                            class_weight="balanced",
                        ),
                    ),
                ]
            ),
        ),
        (
            "KNN (k=5)",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("clf", KNeighborsClassifier(n_neighbors=5, n_jobs=-1)),
                ]
            ),
        ),
        (
            "MLP (2 layers)",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        MLPClassifier(
                            hidden_layer_sizes=(128, 64),
                            max_iter=400,
                            random_state=seed,
                        ),
                    ),
                ]
            ),
        ),
        (
            "LogisticRegression",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        LogisticRegression(
                            max_iter=2000,
                            random_state=seed,
                            class_weight="balanced",
                        ),
                    ),
                ]
            ),
        ),
        (
            "AdaBoost",
            AdaBoostClassifier(random_state=seed, n_estimators=200),
        ),
        (
            "GaussianNB",
            GaussianNB(),
        ),
    ]
    return models


def try_xgboost_model(seed):
    try:
        from xgboost import XGBClassifier
    except ImportError:
        return None
    return (
        "XGBoost",
        XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.1,
            random_state=seed,
            n_jobs=-1,
            eval_metric="mlogloss",
        ),
    )


def evaluate_model(name, model, X_train, X_val, y_train, y_val):
    start = perf_counter()
    model.fit(X_train, y_train)
    train_seconds = perf_counter() - start
    y_pred = model.predict(X_val)
    return BenchmarkResult(
        name=name,
        accuracy=float(accuracy_score(y_val, y_pred)),
        top3_accuracy=float(top_k_accuracy(model, X_val, y_val, k=3)),
        macro_f1=float(f1_score(y_val, y_pred, average="macro", zero_division=0)),
        train_seconds=train_seconds,
        feature_dims=X_train.shape[1],
    )


def run_benchmark(X, y_text, test_size, seed, feature_variant):
    X = slice_features(X, feature_variant)
    X_train, X_val, y_train, y_val, label_encoder = make_split(
        X, y_text, test_size=test_size, seed=seed
    )

    results = []
    for name, model in build_models(seed):
        result = evaluate_model(name, clone(model), X_train, X_val, y_train, y_val)
        results.append(result)

    xgb = try_xgboost_model(seed)
    if xgb is not None:
        name, model = xgb
        results.append(
            evaluate_model(name, clone(model), X_train, X_val, y_train, y_val)
        )

    results.sort(key=lambda item: (item.top3_accuracy, item.accuracy), reverse=True)
    meta = {
        "feature_variant": feature_variant,
        "feature_dims": int(X.shape[1]),
        "n_samples": int(len(y_text)),
        "n_classes": int(len(label_encoder.classes_)),
        "n_train": int(len(y_train)),
        "n_val": int(len(y_val)),
        "seed": seed,
        "test_size": test_size,
    }
    return meta, results


def print_table(meta, results):
    print()
    print("=" * 88)
    print(
        f"Benchmark: {meta['feature_variant']} ({meta['feature_dims']} dims) | "
        f"{meta['n_samples']} samples, {meta['n_classes']} classes | "
        f"train={meta['n_train']} val={meta['n_val']} seed={meta['seed']}"
    )
    print("=" * 88)
    print(f"{'Rank':<5} {'Algorithm':<28} {'Acc':>8} {'Top-3':>8} {'F1':>8} {'Train(s)':>10}")
    print("-" * 88)
    for rank, result in enumerate(results, start=1):
        marker = " *" if "app default" in result.name else ""
        print(
            f"{rank:<5} {result.name:<28} "
            f"{result.accuracy:>7.1%} {result.top3_accuracy:>7.1%} "
            f"{result.macro_f1:>7.1%} {result.train_seconds:>10.2f}{marker}"
        )
    print("-" * 88)
    print("* = current app algorithm (ExtraTrees)")


def parse_args():
    parser = argparse.ArgumentParser(description="Benchmark bird classification algorithms.")
    parser.add_argument(
        "--features-path",
        default="develop-eggs/artifacts/fft_features.npz",
        help="Path to cached feature matrix (.npz with X, y).",
    )
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--feature-variant",
        choices=("full", "fourier_only", "mfcc_block", "spectral_summary", "all"),
        default="full",
        help="Feature slice to use. 'all' runs every variant when dims allow.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional JSON output path for results.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    features_path = Path(args.features_path)
    if not features_path.is_absolute():
        features_path = PROJECT_ROOT / features_path
    if not features_path.exists():
        raise SystemExit(f"Features file not found: {features_path}")

    data = np.load(features_path)
    X = data["X"]
    y_text = data["y"]

    variants = [args.feature_variant]
    if args.feature_variant == "all":
        if X.shape[1] >= 210:
            variants = ["full", "fourier_only", "mfcc_block", "spectral_summary"]
        elif X.shape[1] == 80:
            variants = ["full"]
            print(
                "Note: cached features are 80-dim (Fourier-only). "
                "Re-run training to compare MFCC/spectral blocks."
            )
        else:
            variants = ["full"]

    all_output = {"runs": []}
    for variant in variants:
        meta, results = run_benchmark(
            X=X,
            y_text=y_text,
            test_size=args.test_size,
            seed=args.seed,
            feature_variant=variant if variant != "full" or X.shape[1] != 80 else "fourier_only",
        )
        if X.shape[1] == 80 and variant == "full":
            meta["feature_variant"] = "fourier_only (cached)"
        print_table(meta, results)
        all_output["runs"].append(
            {
                "meta": meta,
                "results": [asdict(item) for item in results],
            }
        )

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = PROJECT_ROOT / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(all_output, indent=2), encoding="utf-8")
        print(f"\nSaved results to {output_path}")


if __name__ == "__main__":
    main()
