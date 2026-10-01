#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/var/www/petlife-os"
cd "$APP_DIR"

# Runtime secrets are never in git; keep them owner-only even if someone recreates them by hand.
for env_file in apps/api/.env apps/web/.env; do
  [ -f "$env_file" ] && chmod 600 "$env_file"
done

export CI=true

pnpm install --frozen-lockfile
pnpm --filter @petlife/api db:generate
pnpm --filter @petlife/api db:migrate:deploy
pnpm build

pm2 restart petlife-api petlife-web --update-env
pm2 save

curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  http://127.0.0.1:4000/health/live >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  http://127.0.0.1:3000/fa >/dev/null

echo "Deploy completed successfully at $(date --iso-8601=seconds)"
