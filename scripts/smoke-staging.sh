#!/usr/bin/env bash
set -euo pipefail

api_base_url="${API_BASE_URL:-http://127.0.0.1:4000}"
web_base_url="${WEB_BASE_URL:-http://127.0.0.1:3000}"

check() {
  local label="$1"
  local url="$2"
  echo "smoke: ${label} -> ${url}"
  curl --fail --silent --show-error --retry 8 --retry-delay 3 --retry-connrefused --max-time 20 "$url" >/dev/null
}

check "api live" "${api_base_url}/health/live"
check "api ready" "${api_base_url}/health/ready"
check "release traceability" "${api_base_url}/health/version"
check "vet discovery" "${api_base_url}/providers/vets"
check "service taxonomy" "${api_base_url}/services/categories"
check "fa landing" "${web_base_url}/fa"

echo "smoke: passed"
