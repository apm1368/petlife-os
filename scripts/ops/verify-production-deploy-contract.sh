#!/usr/bin/env bash
# Static CI guard for the production deployment contract (TC-04, TC-11).
set -euo pipefail

workflow=".github/workflows/deploy.yml"

test -f "$workflow"
test -f "scripts/smoke-production.sh"
test -f "docs/qa/tools/public-assets-smoke.py"

grep -Fq "branches: [main]" "$workflow"
grep -Fq "export DEPLOYMENT_ENVIRONMENT='production'" "$workflow"
grep -Fq "bash scripts/smoke-production.sh" "$workflow"
grep -Fq "Verify public HTML and build assets" "$workflow"
grep -Fq "python3 docs/qa/tools/public-assets-smoke.py --expected-sha" "$workflow"
grep -Fq "public-assets-" "$workflow"

if grep -Fq "DEPLOYMENT_ENVIRONMENT='staging'" "$workflow"; then
  echo "deploy contract: production workflow must not label its release as staging" >&2
  exit 1
fi

if grep -Fq "smoke-staging.sh" "$workflow"; then
  echo "deploy contract: production workflow must not run the staging smoke script" >&2
  exit 1
fi

echo "deploy contract: static main → VPS + public-asset smoke contract verified"
