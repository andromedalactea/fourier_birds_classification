import argparse
import json
import os
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, UTC
from pathlib import Path
from time import perf_counter
from math import ceil

import joblib
import numpy as np
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from urllib3.util import Retry

try:
    import librosa
except ImportError as exc:
    raise SystemExit(
        "Missing dependency 'librosa'. Install required packages with:\n"
        "  ./.venv/bin/pip install librosa scipy scikit-learn joblib python-dotenv requests"
    ) from exc

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from lib.audio_features import audio_to_feature  # noqa: E402
from lib.predictor import BirdPredictor  # noqa: E402


load_dotenv(override=True)

API_URL = "https://xeno-canto.org/api/3/recordings"
API_KEY_ENV_VARS = ("XENO_CANTO_API_KEY", "XC_API_KEY")
DEFAULT_QUERY = "lat:5.58-6.836 lon:-76.222--74.695 grp:birds"


def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def get_api_key():
    for var_name in API_KEY_ENV_VARS:
        value = os.getenv(var_name)
        if value:
            return var_name, value
    return None, None


def build_session(total_retries=3, backoff_factor=0.6):
    log(
        f"Building HTTP session with retries={total_retries}, "
        f"backoff_factor={backoff_factor}"
    )
    retry = Retry(
        total=total_retries,
        connect=total_retries,
        read=total_retries,
        status=total_retries,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        backoff_factor=backoff_factor,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def ensure_bird_query(query):
    if "grp:birds" in query:
        return query
    return f"{query} grp:birds".strip()


def fetch_recordings(session, api_key, query, pages, per_page, timeout):
    all_recordings = []
    query = ensure_bird_query(query)
    log(
        f"Starting metadata fetch. query='{query}', pages={pages}, "
        f"per_page={per_page}, timeout={timeout}s"
    )

    for page in range(1, pages + 1):
        page_start = perf_counter()
        params = {"query": query, "key": api_key, "page": page, "per_page": per_page}
        log(f"Requesting API page {page}...")
        response = session.get(API_URL, params=params, timeout=timeout)
        if response.status_code != 200:
            snippet = response.text[:350].replace("\n", " ")
            raise RuntimeError(
                f"API error on page {page} (status={response.status_code}). Snippet: {snippet}"
            )

        payload = response.json()
        recordings = payload.get("recordings", [])
        birds = [r for r in recordings if r.get("grp") == "birds"]
        all_recordings.extend(birds)
        num_pages = int(payload.get("numPages", 1))
        log(
            f"Fetched page {page}/{min(num_pages, pages)} in "
            f"{perf_counter() - page_start:.2f}s: {len(birds)} bird recordings "
            f"(accumulated={len(all_recordings)})"
        )
        if page >= num_pages:
            log("Reached API-reported last page, stopping pagination.")
            break

    if not all_recordings:
        raise RuntimeError("No bird recordings returned by API.")
    log(f"Finished metadata fetch with total bird recordings={len(all_recordings)}")
    return all_recordings


def normalize_species_name(rec):
    gen = (rec.get("gen") or "").strip()
    sp = (rec.get("sp") or "").strip()
    if not gen or not sp:
        return None
    return f"{gen}_{sp}".replace(" ", "_")


def top_species(recordings, top_n):
    log(
        f"Computing species frequency counts from {len(recordings)} recordings, "
        f"top_n={top_n}"
    )
    counts = Counter()
    for rec in recordings:
        species = normalize_species_name(rec)
        if species:
            counts[species] += 1
    return [sp for sp, _ in counts.most_common(top_n)], counts


def select_samples_for_species(recordings, selected_species, max_per_species):
    log(
        f"Selecting capped samples per species. selected_species={len(selected_species)}, "
        f"max_per_species={max_per_species}"
    )
    selected_set = set(selected_species)
    selected = []
    species_counts = defaultdict(int)

    for rec in recordings:
        species = normalize_species_name(rec)
        file_url = rec.get("file")
        if not species or not file_url:
            continue
        if species not in selected_set:
            continue
        if species_counts[species] >= max_per_species:
            continue
        rec = dict(rec)
        rec["_species"] = species
        selected.append(rec)
        species_counts[species] += 1

    log(
        f"Selected {len(selected)} recordings across "
        f"{sum(1 for _, c in species_counts.items() if c > 0)} species "
        f"(before extraction errors)."
    )
    return selected


def normalize_file_url(file_url):
    if not file_url:
        return None
    if file_url.startswith("//"):
        return f"https:{file_url}"
    if file_url.startswith("http://") or file_url.startswith("https://"):
        return file_url
    return f"https://{file_url.lstrip('/')}"


def download_temp_audio(session, url, timeout, temp_dir):
    normalized = normalize_file_url(url)
    if not normalized:
        raise RuntimeError("Missing audio URL")
    with session.get(normalized, stream=True, timeout=timeout) as response:
        if response.status_code != 200:
            raise RuntimeError(f"Audio download failed with status {response.status_code}")

        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".mp3", delete=False, dir=temp_dir
        ) as tmp_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    tmp_file.write(chunk)
            return tmp_file.name


def download_audio_to_path(session, url, timeout, output_path):
    normalized = normalize_file_url(url)
    if not normalized:
        raise RuntimeError("Missing audio URL")
    with session.get(normalized, stream=True, timeout=timeout) as response:
        if response.status_code != 200:
            raise RuntimeError(f"Audio download failed with status {response.status_code}")
        with open(output_path, "wb") as out_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    out_file.write(chunk)


def save_manual_test_audios(
    session,
    recordings,
    selected_species,
    excluded_record_ids,
    count,
    output_dir,
    timeout,
):
    if count <= 0:
        return []

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    selected_species_set = set(selected_species)
    used_ids = set(str(record_id) for record_id in excluded_record_ids if record_id is not None)
    candidates = []
    seen_ids = set()

    for rec in recordings:
        rec_id = rec.get("id")
        rec_id_text = str(rec_id) if rec_id is not None else None
        species = normalize_species_name(rec)
        file_url = rec.get("file")
        if not rec_id_text or not species or not file_url:
            continue
        if species not in selected_species_set:
            continue
        if rec_id_text in used_ids:
            continue
        if rec_id_text in seen_ids:
            continue
        candidates.append((rec_id_text, species, file_url))
        seen_ids.add(rec_id_text)

    if not candidates:
        log("No candidate recordings available for manual test audio export.")
        return []

    # Prefer species diversity first, then fill remaining slots.
    selected_candidates = []
    used_species = set()
    for rec_id, species, file_url in candidates:
        if len(selected_candidates) >= count:
            break
        if species in used_species:
            continue
        selected_candidates.append((rec_id, species, file_url))
        used_species.add(species)

    if len(selected_candidates) < count:
        chosen_ids = {rec_id for rec_id, _, _ in selected_candidates}
        for rec_id, species, file_url in candidates:
            if len(selected_candidates) >= count:
                break
            if rec_id in chosen_ids:
                continue
            selected_candidates.append((rec_id, species, file_url))
            chosen_ids.add(rec_id)

    saved = []
    log(
        f"Saving {len(selected_candidates)} manual-test audios to {output_dir} "
        "(not used in training records)."
    )
    for idx, (rec_id, species, file_url) in enumerate(selected_candidates, start=1):
        filename = f"{idx:02d}_{species}_{rec_id}.mp3"
        destination = output_dir / filename
        log(f"[manual-test {idx}/{len(selected_candidates)}] Downloading {filename}")
        download_audio_to_path(
            session=session,
            url=file_url,
            timeout=timeout,
            output_path=destination,
        )
        file_size_kb = destination.stat().st_size / 1024.0
        log(
            f"[manual-test {idx}/{len(selected_candidates)}] Saved {destination} "
            f"({file_size_kb:.1f} KB)"
        )
        saved.append(
            {
                "id": rec_id,
                "species": species,
                "file_path": str(destination),
            }
        )

    manifest_path = output_dir / "manual_test_manifest.json"
    manifest_path.write_text(json.dumps(saved, indent=2), encoding="utf-8")
    log(f"Manual-test manifest saved: {manifest_path}")
    return saved


def build_feature_dataset(records, session, timeout, sample_rate, clip_seconds):
    features = []
    labels = []
    used_records = []
    failed = 0

    with tempfile.TemporaryDirectory(prefix="bird_audio_tmp_") as temp_dir:
        log(
            f"Starting feature extraction for {len(records)} recordings. "
            f"temp_dir={temp_dir}"
        )
        for idx, rec in enumerate(records, start=1):
            audio_path = None
            species = rec["_species"]
            record_id = rec.get("id")
            item_start = perf_counter()
            try:
                log(
                    f"[{idx}/{len(records)}] Downloading audio for "
                    f"id={record_id}, species={species}"
                )
                audio_path = download_temp_audio(
                    session=session, url=rec.get("file"), timeout=timeout, temp_dir=temp_dir
                )
                file_size_kb = os.path.getsize(audio_path) / 1024.0
                log(
                    f"[{idx}/{len(records)}] Downloaded temp file={audio_path} "
                    f"({file_size_kb:.1f} KB), extracting Fourier features..."
                )
                feature = audio_to_feature(
                    audio_path=audio_path,
                    sample_rate=sample_rate,
                    clip_seconds=clip_seconds,
                )
                features.append(feature)
                labels.append(species)
                used_records.append({"id": record_id, "species": species})
                log(
                    f"[{idx}/{len(records)}] Feature vector created "
                    f"(dim={feature.shape[0]}) in {perf_counter() - item_start:.2f}s"
                )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                log(
                    f"[{idx}/{len(records)}] Skipped {species} "
                    f"(id={record_id}) due to error: {exc}"
                )
            finally:
                if audio_path and os.path.exists(audio_path):
                    os.remove(audio_path)
                    log(f"[{idx}/{len(records)}] Deleted temp file: {audio_path}")

            if idx % 10 == 0:
                log(
                    f"Progress checkpoint: processed={idx}/{len(records)}, "
                    f"ok={len(features)}, failed={failed}"
                )

    log(f"Feature extraction done. ok={len(features)} failed={failed}")
    if not features:
        raise RuntimeError("No features were extracted.")

    log(
        f"Final feature matrix shape={np.vstack(features).shape}, "
        f"labels_shape={(np.array(labels)).shape}"
    )
    return np.vstack(features), np.array(labels), used_records


def filter_classes_for_split(X, y_text):
    log("Filtering classes that have fewer than 2 samples...")
    counts = Counter(y_text.tolist())
    keep = {label for label, count in counts.items() if count >= 2}
    mask = np.array([label in keep for label in y_text], dtype=bool)
    X_filtered = X[mask]
    y_filtered = y_text[mask]

    dropped = sorted(label for label, count in counts.items() if count < 2)
    if dropped:
        log(f"Dropped {len(dropped)} classes with <2 samples after extraction.")

    if len(np.unique(y_filtered)) < 2:
        raise RuntimeError("Need at least 2 species with >=2 samples each to train.")
    log(
        f"Classes retained for split: {len(np.unique(y_filtered))}. "
        f"Dataset shape after filtering: X={X_filtered.shape}, y={y_filtered.shape}"
    )
    return X_filtered, y_filtered


def top_k_accuracy(model, X, y_true, k=3):
    probabilities = model.predict_proba(X)
    top_k_indices = np.argsort(probabilities, axis=1)[:, -k:]
    hits = 0
    for row_idx, true_value in enumerate(y_true):
        if true_value in top_k_indices[row_idx]:
            hits += 1
    return hits / len(y_true)


def train_and_evaluate(X, y_text, test_size, seed):
    log(
        f"Starting model training pipeline. test_size={test_size}, seed={seed}, "
        f"input_shape={X.shape}"
    )
    X, y_text = filter_classes_for_split(X, y_text)
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_text)

    n_samples = len(y)
    n_classes = len(label_encoder.classes_)
    desired_test_count = max(int(ceil(n_samples * test_size)), n_classes)
    max_test_count = n_samples - n_classes
    if max_test_count < n_classes:
        raise RuntimeError(
            "Not enough samples to make a stratified split with at least one "
            "sample per class in both train and validation sets. "
            f"samples={n_samples}, classes={n_classes}. "
            "Increase data size or reduce number of classes."
        )
    if desired_test_count > max_test_count:
        desired_test_count = max_test_count

    adjusted_test_size = desired_test_count / n_samples
    if abs(adjusted_test_size - float(test_size)) > 1e-9:
        log(
            "Adjusted test_size to satisfy stratified split constraints: "
            f"original={test_size}, adjusted={adjusted_test_size:.4f}, "
            f"test_count={desired_test_count}, classes={n_classes}"
        )

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=adjusted_test_size,
        random_state=seed,
        stratify=y,
    )
    log(
        f"Data split complete. X_train={X_train.shape}, X_val={X_val.shape}, "
        f"classes={len(label_encoder.classes_)}"
    )

    rf_model = RandomForestClassifier(
        n_estimators=300,
        random_state=seed,
        n_jobs=-1,
        class_weight="balanced_subsample",
    )
    et_model = ExtraTreesClassifier(
        n_estimators=500,
        random_state=seed,
        n_jobs=-1,
        class_weight="balanced",
    )

    candidates = [
        ("RandomForestClassifier", rf_model),
        ("ExtraTreesClassifier", et_model),
    ]
    best = None

    for model_name, candidate_model in candidates:
        train_start = perf_counter()
        log(f"Training {model_name}...")
        candidate_model.fit(X_train, y_train)
        elapsed = perf_counter() - train_start
        y_pred = candidate_model.predict(X_val)
        accuracy = float(accuracy_score(y_val, y_pred))
        top3 = float(top_k_accuracy(candidate_model, X_val, y_val, k=3))
        log(
            f"{model_name} finished in {elapsed:.2f}s "
            f"(accuracy={accuracy:.4f}, top3={top3:.4f})"
        )
        score_tuple = (top3, accuracy)
        if best is None or score_tuple > best["score_tuple"]:
            best = {
                "model": candidate_model,
                "model_name": model_name,
                "accuracy": accuracy,
                "top3": top3,
                "score_tuple": score_tuple,
                "y_pred": y_pred,
            }

    model = best["model"]
    y_pred = best["y_pred"]
    accuracy = best["accuracy"]
    top3 = best["top3"]
    report = classification_report(
        y_val,
        y_pred,
        target_names=label_encoder.classes_,
        output_dict=True,
        zero_division=0,
    )

    metrics = {
        "accuracy": accuracy,
        "top3_accuracy": top3,
        "n_train": int(len(y_train)),
        "n_val": int(len(y_val)),
        "n_classes": int(len(label_encoder.classes_)),
        "selected_model": best["model_name"],
        "classification_report": report,
    }
    log(
        f"Evaluation complete with {best['model_name']}. "
        f"accuracy={accuracy:.4f}, top3_accuracy={top3:.4f}, "
        f"n_train={len(y_train)}, n_val={len(y_val)}"
    )
    return model, label_encoder, metrics


def save_artifacts(
    artifacts_dir,
    X,
    y_text,
    used_records,
    model,
    label_encoder,
    metrics,
    feature_config,
):
    artifacts_dir = Path(artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    log(f"Saving artifacts to directory: {artifacts_dir}")

    features_path = artifacts_dir / "fft_features.npz"
    np.savez_compressed(features_path, X=X, y=y_text)

    label_path = artifacts_dir / "species_label_encoder.json"
    label_data = {"classes": label_encoder.classes_.tolist()}
    label_path.write_text(json.dumps(label_data, indent=2), encoding="utf-8")

    model_path = artifacts_dir / "bird_fft_model.joblib"
    bundle = {
        "model": model,
        "classes": label_encoder.classes_.tolist(),
        "feature_config": feature_config,
        "created_at": datetime.now(UTC).isoformat(),
    }
    joblib.dump(bundle, model_path)

    metrics_path = artifacts_dir / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    records_path = artifacts_dir / "used_records.json"
    records_path.write_text(json.dumps(used_records, indent=2), encoding="utf-8")

    log("Artifacts saved:")
    log(f"  - {features_path}")
    log(f"  - {label_path}")
    log(f"  - {model_path}")
    log(f"  - {metrics_path}")
    log(f"  - {records_path}")
    return model_path


def run_train(args):
    global_start = perf_counter()
    log(f"Starting train command with args: {vars(args)}")
    env_name, api_key = get_api_key()
    if not api_key:
        raise RuntimeError(
            "Missing Xeno-Canto API key. Set XENO_CANTO_API_KEY or XC_API_KEY in .env."
        )
    log(f"Using API key from env var: {env_name}")

    session = build_session(total_retries=args.retries)
    recordings = fetch_recordings(
        session=session,
        api_key=api_key,
        query=args.query,
        pages=args.pages,
        per_page=args.per_page,
        timeout=args.timeout,
    )

    selected_species, species_counts = top_species(recordings, args.top_species)
    log("Top species by count (before extraction):")
    for species in selected_species[:10]:
        log(f"  {species}: {species_counts[species]}")

    selected_records = select_samples_for_species(
        recordings=recordings,
        selected_species=selected_species,
        max_per_species=args.max_per_species,
    )

    if args.save_manual_test_audios > 0:
        selected_record_ids = {rec.get("id") for rec in selected_records if rec.get("id") is not None}
        save_manual_test_audios(
            session=session,
            recordings=recordings,
            selected_species=selected_species,
            excluded_record_ids=selected_record_ids,
            count=args.save_manual_test_audios,
            output_dir=args.manual_test_dir,
            timeout=args.timeout,
        )

    X, y_text, used_records = build_feature_dataset(
        records=selected_records,
        session=session,
        timeout=args.timeout,
        sample_rate=args.sample_rate,
        clip_seconds=args.clip_seconds,
    )

    model, label_encoder, metrics = train_and_evaluate(
        X=X, y_text=y_text, test_size=args.test_size, seed=args.seed
    )

    feature_config = {
        "sample_rate": args.sample_rate,
        "clip_seconds": args.clip_seconds,
        "n_fft": 1024,
        "hop_length": 512,
        "n_bands": 32,
        "feature_variant": "stft_mfcc_spectral_v2",
    }

    model_path = save_artifacts(
        artifacts_dir=args.artifacts_dir,
        X=X,
        y_text=y_text,
        used_records=used_records,
        model=model,
        label_encoder=label_encoder,
        metrics=metrics,
        feature_config=feature_config,
    )

    log("Training complete.")
    log(f"Accuracy: {metrics['accuracy']:.4f}")
    log(f"Top-3 accuracy: {metrics['top3_accuracy']:.4f}")
    log(f"Classes used: {metrics['n_classes']}")
    log(f"Selected model: {metrics['selected_model']}")
    log(f"Model saved to: {model_path}")
    log(f"Total train command runtime: {perf_counter() - global_start:.2f}s")


def run_predict(args):
    log(f"Starting predict command with args: {vars(args)}")
    predictor = BirdPredictor(model_path=args.model_path)
    log(
        f"Loaded model bundle from {predictor.model_path}. "
        f"classes={predictor.n_species}, feature_config={predictor.feature_config}"
    )

    result = predictor.predict(audio_path=args.audio_path, top_k=args.top_k)
    log(f"Feature extraction for inference complete. feature_dim={result.feature_dim}")
    log(f"Predictions for: {args.audio_path}")
    for pred in result.predictions:
        log(f"{pred.rank}. {pred.species}  (p={pred.probability:.4f})")


def run_quick_test(args):
    log(f"Starting quick-test command with args: {vars(args)}")
    quick_args = argparse.Namespace(**vars(args))
    quick_args.pages = min(args.pages, 3)
    quick_args.top_species = min(args.top_species, 8)
    quick_args.max_per_species = min(args.max_per_species, 6)
    quick_args.artifacts_dir = args.artifacts_dir
    log("Running quick test configuration:")
    log(
        f"  pages={quick_args.pages}, top_species={quick_args.top_species}, "
        f"max_per_species={quick_args.max_per_species}"
    )
    run_train(quick_args)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Bird species classification from Fourier features (Xeno-Canto)."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="Fetch data and train model.")
    train_parser.add_argument("--query", default=DEFAULT_QUERY)
    train_parser.add_argument("--pages", type=int, default=12)
    train_parser.add_argument("--per-page", type=int, default=100)
    train_parser.add_argument("--top-species", type=int, default=30)
    train_parser.add_argument("--max-per-species", type=int, default=20)
    train_parser.add_argument("--sample-rate", type=int, default=22050)
    train_parser.add_argument("--clip-seconds", type=float, default=12.0)
    train_parser.add_argument("--timeout", type=float, default=40.0)
    train_parser.add_argument("--retries", type=int, default=3)
    train_parser.add_argument("--test-size", type=float, default=0.2)
    train_parser.add_argument("--seed", type=int, default=42)
    train_parser.add_argument("--artifacts-dir", default="artifacts")
    train_parser.add_argument("--save-manual-test-audios", type=int, default=0)
    train_parser.add_argument(
        "--manual-test-dir", default="artifacts/manual_test_audios"
    )

    quick_parser = subparsers.add_parser(
        "quick-test", help="Short end-to-end train/eval test run."
    )
    quick_parser.add_argument("--query", default=DEFAULT_QUERY)
    quick_parser.add_argument("--pages", type=int, default=4)
    quick_parser.add_argument("--per-page", type=int, default=100)
    quick_parser.add_argument("--top-species", type=int, default=10)
    quick_parser.add_argument("--max-per-species", type=int, default=8)
    quick_parser.add_argument("--sample-rate", type=int, default=22050)
    quick_parser.add_argument("--clip-seconds", type=float, default=10.0)
    quick_parser.add_argument("--timeout", type=float, default=40.0)
    quick_parser.add_argument("--retries", type=int, default=3)
    quick_parser.add_argument("--test-size", type=float, default=0.2)
    quick_parser.add_argument("--seed", type=int, default=42)
    quick_parser.add_argument("--artifacts-dir", default="artifacts")
    quick_parser.add_argument("--save-manual-test-audios", type=int, default=0)
    quick_parser.add_argument(
        "--manual-test-dir", default="artifacts/manual_test_audios"
    )

    predict_parser = subparsers.add_parser(
        "predict", help="Predict bird species from one audio file."
    )
    predict_parser.add_argument("--audio-path", required=True)
    predict_parser.add_argument(
        "--model-path", default="artifacts/bird_fft_model.joblib"
    )
    predict_parser.add_argument("--top-k", type=int, default=5)

    return parser.parse_args()


def main():
    args = parse_args()
    if args.command == "train":
        run_train(args)
    elif args.command == "quick-test":
        run_quick_test(args)
    elif args.command == "predict":
        run_predict(args)
    else:
        raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
