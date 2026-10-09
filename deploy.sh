#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/var/www/petlife-os"
cd "$APP_DIR"

# Runtime secrets are never in git; keep them owner-only even if someone recreates them by hand.
for env_file in apps/api/.env apps/web/.env; do
  [ -f "$env_file" ] && chmod 600 "$env_file"
done

export CI=true

# Data services: start them if they are down, and keep the running containers' restart policy in sync with
# docker-compose.yml (restart: unless-stopped) without recreating them — so they come back by themselves after a reboot.
docker compose -f "$APP_DIR/docker-compose.yml" up -d --no-recreate --pull never postgres redis minio
for c in petlife-os-postgres-1 petlife-os-redis-1 petlife-os-minio-1; do docker update --restart unless-stopped "$c" >/dev/null; done

pnpm install --frozen-lockfile
pnpm --filter @petlife/api db:generate
pnpm --filter @petlife/api db:migrate:deploy
pnpm build

# PM2 apps are defined in git (ecosystem.config.js). Recreate them from it so restart settings never drift.
pm2 delete petlife-api petlife-web >/dev/null 2>&1 || true
pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save

curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  http://127.0.0.1:4000/health/live >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  http://127.0.0.1:3000/fa >/dev/null

echo "Deploy completed successfully at $(date --iso-8601=seconds)"
