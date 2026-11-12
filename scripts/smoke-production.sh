#!/usr/bin/env bash
# Production smoke checks run after deploy.sh has built, reloaded PM2, and configured nginx.
# They deliberately use only safe GET requests: no payment, SMS, upload, or data mutation.
set -euo pipefail

api_base_url="${API_BASE_URL:-http://127.0.0.1:4000}"
web_base_url="${WEB_BASE_URL:-http://127.0.0.1:3000}"
public_base_url="${PUBLIC_BASE_URL:-https://opetlife.ir}"
expected_environment="${EXPECTED_DEPLOYMENT_ENVIRONMENT:-production}"
expected_sha="${EXPECTED_BUILD_SHA:-${BUILD_SHA:-}}"

check() {
  local label="$1"
  local url="$2"
  echo "smoke: ${label} -> ${url}"
  curl --fail --silent --show-error --retry 8 --retry-delay 3 --retry-connrefused --max-time 20 "$url" >/dev/null
}

check "api live" "${api_base_url}/health/live"
check "api ready" "${api_base_url}/health/ready"

version_json="$(curl --fail --silent --show-error --retry 8 --retry-delay 3 --retry-connrefused --max-time 20 "${api_base_url}/health/version")"
VERSION_JSON="$version_json" EXPECTED_ENVIRONMENT="$expected_environment" EXPECTED_SHA="$expected_sha" node -e '
const release = JSON.parse(process.env.VERSION_JSON);
if (release.environment !== process.env.EXPECTED_ENVIRONMENT) {
  throw new Error(`expected deployment environment ${process.env.EXPECTED_ENVIRONMENT}, got ${release.environment}`);
}
if (process.env.EXPECTED_SHA && release.sha !== process.env.EXPECTED_SHA) {
  throw new Error(`expected build SHA ${process.env.EXPECTED_SHA}, got ${release.sha}`);
}
console.log(`smoke: release traceability -> ${release.sha} (${release.environment})`);
'

check "vet discovery" "${api_base_url}/providers/vets"
check "service taxonomy" "${api_base_url}/services/categories"
check "fa landing" "${web_base_url}/"
check "public api ready" "${public_base_url}/api/health/ready"
check "public fa landing" "${public_base_url}/"

echo "smoke: passed"
