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

1. Entrena o copia los nuevos archivos en `artifacts/`:
   - `bird_fft_model.joblib`
   - `species_label_encoder.json` (debe coincidir con las clases del modelo)
2. Actualiza `artifacts/manifest.json` (versión, métricas, `n_species`).
3. Haz commit y push — Render redespliega automáticamente.

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
   git add .gitattributes artifacts/
   git commit -m "Add deployment artifacts"
   git push
   ```
2. En [Render](https://render.com), crea un **Blueprint** desde el repo o conecta el servicio web.
3. Render construye el `Dockerfile` (frontend + API + artefactos) y expone la app en un solo dominio.
4. El health check usa `GET /api/health`.

**Nota:** el modelo ocupa ~205 MB en disco y memoria al cargarse. Si el plan free queda corto de RAM, sube a un plan con más memoria.
