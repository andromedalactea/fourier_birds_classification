#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/develop-eggs/artifacts"
DEST="${ROOT}/artifacts"

FILES=(
  "bird_fft_model.joblib"
  "species_label_encoder.json"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "${SRC}/${file}" ]]; then
    echo "Missing source file: ${SRC}/${file}" >&2
    echo "Train first: ./.venv/bin/python scripts/train_bird_fft_classifier.py train" >&2
    exit 1
  fi
done

mkdir -p "${DEST}"
cp "${SRC}/bird_fft_model.joblib" "${DEST}/"
cp "${SRC}/species_label_encoder.json" "${DEST}/"

METRICS="${SRC}/metrics.json"
MANIFEST="${DEST}/manifest.json"
if [[ -f "${METRICS}" ]]; then
  python3 - "${METRICS}" "${MANIFEST}" <<'PY'
import json
import sys
from datetime import date

metrics_path, manifest_path = sys.argv[1:3]
with open(metrics_path, encoding="utf-8") as handle:
    metrics = json.load(handle)

manifest = {}
if __import__("pathlib").Path(manifest_path).exists():
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)

manifest.update(
    {
        "n_species": metrics.get("n_classes", manifest.get("n_species")),
        "selected_model": metrics.get("selected_model", manifest.get("selected_model")),
        "accuracy": round(metrics.get("accuracy", manifest.get("accuracy", 0)), 3),
        "top3_accuracy": round(
            metrics.get("top3_accuracy", manifest.get("top3_accuracy", 0)), 3
        ),
        "trained_at": date.today().isoformat(),
    }
)
manifest.setdefault("version", "1.0.0")

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2)
    handle.write("\n")
PY
  echo "Updated manifest from metrics.json"
else
  echo "No metrics.json found — manifest.json left unchanged"
fi

echo ""
echo "Published to ${DEST}:"
ls -lh "${DEST}/bird_fft_model.joblib" "${DEST}/species_label_encoder.json" "${DEST}/manifest.json"
echo ""
echo "Next steps:"
echo "  1. Bump version in artifacts/manifest.json if needed"
echo "  2. git add artifacts/"
echo "  3. git commit -m \"Update model artifacts\""
echo "  4. git push   # triggers Render redeploy"
