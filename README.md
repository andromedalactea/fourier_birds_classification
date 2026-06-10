# Aves Sonoras — Identificación de aves por firma sonora

Clasificación de especies de aves a partir de audio usando transformadas de Fourier, características MFCC y un modelo ExtraTrees entrenado con datos de [Xeno-Canto](https://xeno-canto.org/).

## Estructura del proyecto

```
fourier_birds_classification/
├── api/              # API FastAPI para inferencia
├── web/              # Frontend PWA (React + Vite + Tailwind)
├── lib/              # Código Python compartido (features + predictor)
├── scripts/          # Entrenamiento y descarga de datos
├── artifacts/        # Modelo y especies versionados (deploy)
│   ├── bird_fft_model.joblib      # Git LFS
│   ├── species_label_encoder.json
│   └── manifest.json
└── develop-eggs/     # Artefactos locales de entrenamiento (gitignored)
```

## Requisitos

- **Python 3.12+** con dependencias ML (`requirements.txt` + `api/requirements.txt`)
- **Node.js 20+** para el frontend
- **Git LFS** para el modelo entrenado (~205 MB)
- Modelo en `artifacts/bird_fft_model.joblib`

## Configuración

```bash
# Git LFS (necesario para clonar el modelo)
git lfs install
git lfs pull

# Entorno Python
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/pip install -r api/requirements.txt

# Frontend
cd web && npm install
```

### Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `ARTIFACTS_DIR` | Carpeta con modelo y especies | `artifacts` |
| `MODEL_PATH` | Ruta al archivo `.joblib` | `artifacts/bird_fft_model.joblib` |
| `SPECIES_PATH` | Ruta al JSON de especies | `artifacts/species_label_encoder.json` |
| `MANIFEST_PATH` | Metadatos del modelo desplegado | `artifacts/manifest.json` |
| `STATIC_DIR` | Build del frontend (producción) | `web/dist` |
| `CORS_ORIGINS` | Orígenes permitidos (coma) | `http://localhost:5173,http://127.0.0.1:5173` |
| `PORT` | Puerto del servidor | `8000` |
| `XENO_CANTO_API_KEY` | API key para entrenamiento | — |

### Actualizar el modelo o las especies

1. Entrena localmente (salida en `develop-eggs/artifacts/`):
   ```bash
   ./.venv/bin/python scripts/train_bird_fft_classifier.py train
   ```
2. Publica a la carpeta versionada:
   ```bash
   ./scripts/publish_artifacts.sh
   ```
3. Revisa y, si aplica, sube `version` en `artifacts/manifest.json`.
4. Haz commit y push — Render redespliega automáticamente.

También puedes apuntar a otra carpeta sin mover archivos:

```bash
export ARTIFACTS_DIR=/ruta/a/otro-modelo
# o rutas individuales:
export MODEL_PATH=/ruta/modelo.joblib
export SPECIES_PATH=/ruta/species_label_encoder.json
```

## Desarrollo

### Terminal 1 — API

```bash
./.venv/bin/uvicorn api.main:app --reload --port 8000
```

### Terminal 2 — Frontend

```bash
cd web && npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). El proxy de Vite redirige `/api` al puerto 8000.

### Probar la API directamente

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/species
curl -X POST "http://127.0.0.1:8000/api/predict?top_k=5" \
  -F "audio=@ruta/al/audio.mp3"
```

### Espectros de Fourier por especie

La comparación visual de espectros (panel "Huella de Fourier" en la web) usa
`artifacts/species_spectra.json`: el espectro promedio normalizado (128 bandas,
0–11.025 kHz) y los picos de frecuencia dominantes de cada especie, calculados
con las mismas grabaciones de Xeno-Canto del entrenamiento.

Para regenerarlo (por ejemplo, tras reentrenar el modelo):

```bash
./.venv/bin/python scripts/build_species_spectra.py --records-per-species 4
# añade --force para recalcular especies ya existentes
```

El script es reanudable (guarda progreso tras cada especie). La API expone los
espectros en la respuesta de `POST /api/predict` (campo `spectrum`) y en
`GET /api/spectra?species=A,B`.

### CLI de predicción (sin API)

```bash
./.venv/bin/python scripts/train_bird_fft_classifier.py predict \
  --audio-path ruta/al/audio.mp3 \
  --model-path artifacts/bird_fft_model.joblib \
  --top-k 5
```

## Instalar la PWA en el teléfono

1. Despliega o accede a la app desde HTTPS (o `localhost` en desarrollo).
2. **Android / Chrome**: aparece el banner *"Instalar app"* o usa el menú del navegador → *Instalar aplicación*.
3. **iOS / Safari**: *Compartir* → *Añadir a pantalla de inicio*.

La app funciona en modo standalone sin necesidad de una app nativa.

## Modelo

- **30 especies** de la región colombiana (formato `Genus_species`)
- **Entrada**: primeros 12 s de audio mono a 22.05 kHz
- **Features**: vector de 210 dimensiones (STFT + MFCC + espectral)
- **Métricas** (validación): ~60% accuracy, ~78% top-3

## Despliegue en Render

El repo incluye `render.yaml` (plan **free**, sin disco persistente).

1. Sube el repo a GitHub con Git LFS habilitado:
   ```bash
   git lfs install
   git push origin main
   ```
2. En [Render](https://render.com), crea un **Blueprint** desde el repo (lee `render.yaml`).
3. En el servicio, activa **Git LFS** (Settings) para que el build descargue el `.joblib` real.
4. Render construye el `Dockerfile` (frontend + API + artefactos) y expone la app en un solo dominio.
5. Verifica `GET /api/health` → `model_loaded: true`, `n_species: 30`.

**Memoria en Render:** Free y Starter tienen **512 MB RAM** (Starter no da más RAM que Free). El modelo completo entrenado (~500 árboles, ~540 MB en RAM) no cabe ahí. `publish_artifacts.sh` publica una versión reducida (**80 árboles, ~5 MB, ~180 MB RAM**) para el plan free. Para el modelo completo en producción usa el plan **Standard** (2 GB RAM) y publica sin reducir: `DEPLOY_ESTIMATORS=500 ./scripts/publish_artifacts.sh`.
