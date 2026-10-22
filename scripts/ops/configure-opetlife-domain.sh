#!/usr/bin/env bash
# Installs HTTPS for the canonical domain without exposing secrets. The active nginx file and any
# firewall rule added by this run are restored if certificate issuance, nginx validation, or the
# same-origin application smoke check fails.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/petlife-os}"
DOMAIN="opetlife.ir"
SITE_FILE="/etc/nginx/sites-available/petlife-os"
SITE_LINK="/etc/nginx/sites-enabled/petlife-os"
ACME_ROOT="/var/www/letsencrypt"
BACKUP_DIR="/root/petlife-backups"
LOCK_FILE="/var/lock/petlife-domain.lock"

log() { echo "domain[$(date -u +%H:%M:%S)]: $*"; }

[ "$(id -u)" -eq 0 ] || { echo "domain: root is required" >&2; exit 1; }
[ -f "$APP_DIR/docs/ops/nginx-petlife-os.conf" ] || { echo "domain: final nginx template is missing" >&2; exit 1; }
[ -f "$APP_DIR/docs/ops/nginx-petlife-os.bootstrap.conf" ] || { echo "domain: bootstrap nginx template is missing" >&2; exit 1; }

exec 8>"$LOCK_FILE"
flock -n 8 || { echo "domain: another domain configuration holds $LOCK_FILE" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" "$ACME_ROOT" /etc/letsencrypt/renewal-hooks/deploy
chmod 755 "$ACME_ROOT"

backup="$(mktemp "$BACKUP_DIR/nginx-petlife-os.rollback.XXXXXX")"
had_site=false
if [ -f "$SITE_FILE" ]; then
  cp -a "$SITE_FILE" "$backup"
  had_site=true
else
  : > "$backup"
fi
ufw_added=false

rollback() {
  trap - ERR
  log "FAILED — restoring the previous nginx configuration"
  if [ "$had_site" = true ]; then
    cp -a "$backup" "$SITE_FILE"
  else
    rm -f "$SITE_FILE" "$SITE_LINK"
  fi
  nginx -t && systemctl reload nginx || true
  if [ "$ufw_added" = true ]; then
    ufw --force delete allow 443/tcp >/dev/null || true
  fi
  rm -f "$backup"
  exit 1
}
trap rollback ERR

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [ "$had_site" = true ]; then
  cp -a "$SITE_FILE" "$BACKUP_DIR/nginx-petlife-os.$timestamp"
fi

install -m 0644 "$APP_DIR/docs/ops/nginx-petlife-os.bootstrap.conf" "$SITE_FILE"
ln -sfn "$SITE_FILE" "$SITE_LINK"
nginx -t
systemctl reload nginx

if ! command -v certbot >/dev/null 2>&1; then
  log "installing certbot"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends certbot
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  if ! ufw status | grep -Eq '(^|[[:space:]])443/tcp[[:space:]]+ALLOW'; then
    ufw allow 443/tcp >/dev/null
    ufw_added=true
  fi
fi

cert_path="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -s "$cert_path" ] || ! openssl x509 -checkend 604800 -noout -in "$cert_path" >/dev/null 2>&1; then
  log "obtaining or renewing the Let's Encrypt certificate"
  certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --preferred-challenges http --webroot --webroot-path "$ACME_ROOT" --domain "$DOMAIN"
fi

install -m 0755 "$APP_DIR/scripts/ops/reload-nginx-after-cert-renewal.sh" \
  /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
install -m 0644 "$APP_DIR/docs/ops/nginx-petlife-os.conf" "$SITE_FILE"
nginx -t
systemctl reload nginx

curl --fail --silent --show-error --retry 6 --retry-delay 3 --retry-all-errors \
  --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health/ready" >/dev/null
html="$(curl --fail --silent --show-error --retry 6 --retry-delay 3 --retry-all-errors \
  --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/fa")"
asset="$(printf '%s' "$html" | grep -oE '/_next/static/chunks/[^"? ]+\.js' | head -n 1)"
[ -n "$asset" ] || { echo "domain: rendered page did not reference a JavaScript chunk" >&2; false; }
asset_meta="$(curl --fail --silent --show-error \
  --resolve "$DOMAIN:443:127.0.0.1" --output /dev/null --write-out '%{http_code}|%{content_type}|%{redirect_url}' \
  "https://$DOMAIN$asset")"
case "$asset_meta" in
  200\|application/javascript*\||200\|text/javascript*\|) ;;
  *) echo "domain: JavaScript chunk did not return a direct 200 JavaScript response: $asset_meta" >&2; false ;;
esac

if systemctl list-unit-files --type=timer certbot.timer --no-legend 2>/dev/null | grep -q '^certbot.timer'; then
  systemctl enable --now certbot.timer >/dev/null
fi

trap - ERR
rm -f "$backup"
log "HTTPS is active; HTTP redirects to https://$DOMAIN"
