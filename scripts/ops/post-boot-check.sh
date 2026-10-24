#!/usr/bin/env bash
# Read-only check that the canonical server came back by itself (after a reboot or a restart-order test).
# Usage: scripts/ops/post-boot-check.sh [timeout_seconds]   — exits 0 only when every check passes.
set -uo pipefail
deadline=$(( $(date +%s) + ${1:-240} ))
fail=0
check() { local name="$1"; shift; until "$@" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then echo "FAIL  $name"; fail=1; return; fi; sleep 3; done; echo "PASS  $name"; }
check "docker daemon"            systemctl is-active --quiet docker
for c in petlife-os-postgres-1 petlife-os-redis-1 petlife-os-minio-1; do
  check "$c running"             bash -c "[ \"\$(docker inspect -f '{{.State.Running}}' $c)\" = true ]"
done
check "postgres accepts"         docker exec petlife-os-postgres-1 pg_isready -U petlife
check "pm2 petlife-api online"   bash -c "pm2 jlist | grep -q '\"name\":\"petlife-api\".*\"status\":\"online\"'"
check "api bound on :4000"       bash -c "ss -ltn | grep -q '127.0.0.1:4000 '"
check "health/live 200"          curl -sf http://127.0.0.1:4000/health/live
check "health/ready 200"         curl -sf http://127.0.0.1:4000/health/ready
check "web :3000 /fa 200"        curl -sf -o /dev/null http://127.0.0.1:3000/fa
check "public site via nginx"    curl -sf -o /dev/null http://127.0.0.1/fa
check "public API via nginx"     curl -sf http://127.0.0.1/api/health/ready
for c in petlife-os-postgres-1 petlife-os-redis-1 petlife-os-minio-1; do
  echo "INFO  $c restart=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' $c)"
done
exit $fail
