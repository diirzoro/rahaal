#!/usr/bin/env bash
# ================================================================
# Rahaal ERP — Production Docker Launcher
#
# TARGET LOCATION ON LIVE SERVER: /var/www/rahaal/run.sh
#
# Purpose:
#   Build (if needed) and (re)start the self-contained Rahaal Next.js
#   Docker container. Replaces the previous nginx:alpine proxy container
#   that used to forward to https://visa-booking-5.emergent.host.
#
# Architecture served by this script:
#   Host Nginx  →  127.0.0.1:8002  →  container :3000 (Rahaal Next.js)
#                                          │
#                                          └─► existing local MongoDB
#                                              (via MONGO_URL env var)
#
# Safety rules honoured:
#   - Never touches MongoDB / users / tenants / bookings / accounts.
#   - Never touches TargetMedia (port 8001) or /var/www/targetmediagrp.
#   - Never modifies SSL / DNS / Host Nginx.
#   - Reads all secrets from an EXTERNAL env file (never baked into image).
#   - DISABLE_AUTO_SEED=true in the env file prevents any DB writes.
# ================================================================
set -euo pipefail

# ---------- Configurable variables (override via environment) ----------
APP_NAME="${APP_NAME:-rahaal_app}"
IMAGE_TAG="${IMAGE_TAG:-rahaal:latest}"
HOST_BIND="${HOST_BIND:-127.0.0.1}"
HOST_PORT="${HOST_PORT:-8002}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
ENV_FILE="${ENV_FILE:-/etc/rahaal.env}"
APP_DIR="${APP_DIR:-/var/www/rahaal}"
RESTART_POLICY="${RESTART_POLICY:-unless-stopped}"

# ---------- Pre-flight checks ----------
command -v docker >/dev/null 2>&1 || { echo "❌ docker not installed"; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Env file not found: $ENV_FILE"
  echo "   Copy .env.example to $ENV_FILE and fill real values."
  echo "   NEVER commit $ENV_FILE to git."
  exit 1
fi

if [[ ! -f "$APP_DIR/Dockerfile" ]]; then
  echo "❌ Dockerfile not found in $APP_DIR"
  echo "   Expected: $APP_DIR/Dockerfile"
  exit 1
fi

# Reject leaking Emergent URL through env vars
if grep -q "visa-booking-5.emergent.host" "$ENV_FILE" 2>/dev/null; then
  echo "❌ $ENV_FILE still references visa-booking-5.emergent.host — refusing to start."
  exit 1
fi

# Verify required variables are present in env file (without printing values)
for var in MONGO_URL DB_NAME NEXT_PUBLIC_BASE_URL; do
  if ! grep -qE "^${var}=" "$ENV_FILE"; then
    echo "❌ Required env var missing in $ENV_FILE: $var"
    exit 1
  fi
done

# ---------- Build the image ----------
echo "🔨 Building image: $IMAGE_TAG (from $APP_DIR)"
docker build \
  --tag "$IMAGE_TAG" \
  --file "$APP_DIR/Dockerfile" \
  "$APP_DIR"

# ---------- Stop & remove the previous container (idempotent) ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$APP_NAME"; then
  echo "♻️  Removing previous container: $APP_NAME"
  docker rm -f "$APP_NAME" >/dev/null
fi

# ---------- Run the new container ----------
echo "🚀 Starting container: $APP_NAME  (publishing ${HOST_BIND}:${HOST_PORT} → ${CONTAINER_PORT})"
docker run \
  --detach \
  --name "$APP_NAME" \
  --restart "$RESTART_POLICY" \
  --env-file "$ENV_FILE" \
  --publish "${HOST_BIND}:${HOST_PORT}:${CONTAINER_PORT}" \
  --add-host=host.docker.internal:host-gateway \
  "$IMAGE_TAG"

# ---------- Post-start verification ----------
echo "⏳ Waiting for container to become healthy..."
for i in $(seq 1 20); do
  if curl -fsS "http://${HOST_BIND}:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    echo "✅ Rahaal is healthy at http://${HOST_BIND}:${HOST_PORT}/api/health"
    docker ps --filter "name=$APP_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    exit 0
  fi
  sleep 1
done

echo "❌ Container did not become healthy within 20s. Recent logs:"
docker logs --tail 40 "$APP_NAME"
exit 1
