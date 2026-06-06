# syntax=docker/dockerfile:1

######## Frontend ########
FROM node:20-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

######## API runtime ########
FROM python:3.12-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
COPY api/requirements.txt ./api-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r api-requirements.txt

COPY api/ api/
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY --from=web /app/web/dist web/dist

ENV ARTIFACTS_DIR=artifacts \
    STATIC_DIR=web/dist \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
