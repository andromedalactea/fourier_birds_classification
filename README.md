# Aves Sonoras — Identificación de aves por firma sonora

Clasificación de especies de aves a partir de audio usando transformadas de Fourier, características MFCC y un modelo ExtraTrees entrenado con datos de [Xeno-Canto](https://xeno-canto.org/).

## Estructura del proyecto

```
fourier_birds_classification/
├── api/              # API FastAPI para inferencia
├── web/              # Frontend PWA (React + Vite + Tailwind)
├── lib/              # Código Python compartido (features + predictor)
├── scripts/          # Entrenamiento y descarga de datos
└── develop-eggs/artifacts/   # Modelo entrenado (local, gitignored)
```

## Requisitos

- **Python 3.12+** con dependencias ML (`requirements.txt` + `api/requirements.txt`)
- **Node.js 20+** para el frontend
- Modelo entrenado en `develop-eggs/artifacts/bird_fft_model.joblib`

## Configuración

```bash
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
| `MODEL_PATH` | Ruta al archivo `.joblib` | `develop-eggs/artifacts/bird_fft_model.joblib` |
| `CORS_ORIGINS` | Orígenes permitidos (coma) | `http://localhost:5173,http://127.0.0.1:5173` |
| `XENO_CANTO_API_KEY` | API key para entrenamiento | — |

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
  --model-path develop-eggs/artifacts/bird_fft_model.joblib \
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

## Producción

```bash
# Build frontend
cd web && npm run build

# Servir API (ejemplo)
./.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Sirve `web/dist` con cualquier servidor estático y configura el proxy inverso para `/api`.
