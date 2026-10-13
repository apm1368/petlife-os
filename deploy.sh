#!/usr/bin/env bash
# Deploys the commit checked out in $APP_DIR (deploy.yml checks out main at the pushed SHA, then runs this).
# Order: lock → data services → install → DB backup → migrate status/deploy → snapshot running build → build
# (one task at a time, under the shared build lock) → pm2 startOrReload → health. If the build or the health
# check fails, the previous build is restored and reloaded, so a failed deploy never leaves the site down.
set -Eeuo pipefail

APP_DIR="/var/www/petlife-os"
RELEASE_DIR="/var/www/petlife-os-releases"
BACKUP_DIR="/root/backups"
BACKUP_KEEP=14
DEPLOY_LOCK="/var/lock/petlife-deploy.lock"
# Shared with every other heavy pnpm command on this box (other agents' builds/tests), so two builds never
# compete for its 3.9 GB of RAM — the cause of the OOM-killed deploy of efd3be2.
BUILD_LOCK="/var/lock/petlife-build.lock"
SHA="$(git -C "$APP_DIR" rev-parse HEAD)"

log() { echo "deploy[$(date -u +%H:%M:%S)]: $*"; }

exec 9>"$DEPLOY_LOCK"
flock -n 9 || { echo "deploy: another deploy holds $DEPLOY_LOCK" >&2; exit 1; }

cd "$APP_DIR"

# Runtime secrets are never in git; keep them owner-only even if someone recreates them by hand.
for env_file in apps/api/.env apps/web/.env; do
  [ -f "$env_file" ] && chmod 600 "$env_file"
done

# docker-compose.yml takes data-service credentials from the root .env; refuse to fall back to the dev defaults.
for var in POSTGRES_PASSWORD REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD; do
  grep -q "^${var}=." .env 2>/dev/null || { echo "deploy: $var missing from $APP_DIR/.env" >&2; exit 1; }
done
chmod 600 .env

# A dev server next to a production build is what OOM-killed a previous deploy; refuse rather than race it.
if pgrep -f "next dev|nest start --watch|turbo run dev" >/dev/null; then
  echo "deploy: a dev server is running on this host; stop it first" >&2
  exit 1
fi

export CI=true

# Data services: start them if they are down, and keep the running containers' restart policy in sync with
# docker-compose.yml (restart: unless-stopped) without recreating them — so they come back by themselves after a reboot.
docker compose -f "$APP_DIR/docker-compose.yml" up -d --no-recreate --pull never postgres redis minio
for c in petlife-os-postgres-1 petlife-os-redis-1 petlife-os-minio-1; do docker update --restart unless-stopped "$c" >/dev/null; done

log "deploying ${SHA:0:7} (previous: $(cat "$RELEASE_DIR/current-sha" 2>/dev/null | cut -c1-7 || echo none))"

flock "$BUILD_LOCK" pnpm install --frozen-lockfile
flock "$BUILD_LOCK" pnpm --filter @petlife/api db:generate

# Backup before any migration. Retention keeps the newest $BACKUP_KEEP deploy backups; other dumps in the
# directory (manual or incident backups) are never touched.
mkdir -p "$BACKUP_DIR"
backup="$BACKUP_DIR/petlife_os-$(date -u +%Y%m%dT%H%M%S)-deploy-${SHA:0:7}.dump"
docker exec petlife-os-postgres-1 pg_dump -U petlife -Fc petlife_os > "$backup"
chmod 600 "$backup"
log "database backup: $backup ($(du -h "$backup" | cut -f1))"
ls -1t "$BACKUP_DIR"/petlife_os-*-deploy-*.dump | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f

# `migrate status` exits non-zero whenever migrations are pending (the normal case for a deploy), so only a
# failed migration or a history mismatch stops the deploy here.
migrate_status="$(pnpm --filter @petlife/api exec prisma migrate status 2>&1 || true)"
echo "$migrate_status" | grep -E "migrations? found|not yet been applied|up to date|failed|modified" || true
if echo "$migrate_status" | grep -qiE "failed|modified after (they were|it was) applied|drift"; then
  echo "deploy: prisma migrate status reports a failed or modified migration; resolve it before deploying" >&2
  exit 1
fi
pnpm --filter @petlife/api db:migrate:deploy

# Snapshot the running build so a failed build or health check can put it back. Migrations are additive-only
# (no destructive migrations), so the previous build keeps working against the migrated schema.
mkdir -p "$RELEASE_DIR"
have_previous=false
if [ -f apps/api/dist/main.js ] && [ -f apps/web/.next/BUILD_ID ]; then
  rm -rf "$RELEASE_DIR/previous.tmp"
  mkdir -p "$RELEASE_DIR/previous.tmp"
  cp -a apps/api/dist "$RELEASE_DIR/previous.tmp/api-dist"
  mkdir -p "$RELEASE_DIR/previous.tmp/web-next"
  # .next/cache is ~0.9 GB of build cache the server never reads; leave it out of the snapshot.
  find apps/web/.next -mindepth 1 -maxdepth 1 ! -name cache -exec cp -a {} "$RELEASE_DIR/previous.tmp/web-next/" \;
  cp "$RELEASE_DIR/current-sha" "$RELEASE_DIR/previous.tmp/sha" 2>/dev/null || echo unknown > "$RELEASE_DIR/previous.tmp/sha"
  rm -rf "$RELEASE_DIR/previous"
  mv "$RELEASE_DIR/previous.tmp" "$RELEASE_DIR/previous"
  have_previous=true
fi

reload_apps() {
  # 9>&-: if this call has to spawn the PM2 daemon, it must not inherit (and hold forever) the deploy lock.
  pm2 startOrReload "$APP_DIR/ecosystem.config.js" --update-env 9>&-
  pm2 save 9>&-
}

healthy() {
  curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
    http://127.0.0.1:4000/health/ready >/dev/null &&
    curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
      http://127.0.0.1:3000/fa >/dev/null
}

rollback() {
  trap - ERR
  if [ "$have_previous" != true ]; then
    echo "deploy: FAILED and no previous build to restore" >&2
    exit 1
  fi
  log "FAILED — restoring previous build ($(cut -c1-7 "$RELEASE_DIR/previous/sha"))"
  rm -rf apps/api/dist apps/web/.next
  cp -a "$RELEASE_DIR/previous/api-dist" apps/api/dist
  cp -a "$RELEASE_DIR/previous/web-next" apps/web/.next
  reload_apps
  if healthy; then
    echo "deploy: FAILED; previous build restored and healthy. Git HEAD is ${SHA:0:7}, but the running code is the previous build." >&2
  else
    echo "deploy: FAILED and the restored previous build is not healthy either; investigate now" >&2
  fi
  exit 1
}
trap rollback ERR

log "building (one task at a time)"
flock "$BUILD_LOCK" pnpm turbo run build --filter=@petlife/api --filter=@petlife/web --concurrency=1
if [ ! -f apps/api/dist/main.js ] || [ ! -f apps/web/.next/BUILD_ID ]; then
  echo "deploy: build finished without apps/api/dist/main.js or apps/web/.next/BUILD_ID" >&2
  rollback
fi

# startOrReload applies ecosystem.config.js (and the BUILD_* env exported by deploy.yml) without the
# delete+start gap; it starts the apps when they are not registered yet.
reload_apps
healthy

trap - ERR
echo "$SHA" > "$RELEASE_DIR/current-sha"
echo "Deploy of ${SHA:0:7} completed successfully at $(date --iso-8601=seconds)"
