#!/usr/bin/env bash
# Downloads the CI-built release archive of one commit from the deploy-builds pre-release, as several parallel range
# requests. From the VPS a single connection to GitHub's release CDN runs at ~100 KB/s, so a 160 MB archive took
# about 25 minutes, while four connections together reached ~400 KB/s (measured 2026-11-12). The archive is checked
# against its .sha256 here, and deploy.sh checks it again before installing it.
#
# Each part RESUMES: a retry asks only for the bytes it does not have yet and appends them. On 2026-11-13 two of eight
# parts stalled through all five from-zero retries, the whole ~350 MB download was thrown away, and the box fell back
# to a 40-minute on-box build with swap full. A part now keeps retrying while it makes progress and gives up only after
# FETCH_RELEASE_IDLE_ATTEMPTS attempts in a row that added no bytes; deploy.yml's `timeout` bounds the total time.
#
# Usage: fetch-release.sh <40-char sha> <dir>. Exit 0 = "$dir/release-<sha>.tgz" and its .sha256 are complete.
# Test hooks (scripts/ops/fetch-release.test.sh): FETCH_RELEASE_BASE_URL + FETCH_RELEASE_SIZE skip GitHub;
# FETCH_RELEASE_SPEED_TIME and FETCH_RELEASE_BACKOFF_MAX shorten the stall detection and the waits.
set -euo pipefail

sha="${1:-}"
dir="${2:-}"
parts="${FETCH_RELEASE_PARTS:-8}"
repo="${FETCH_RELEASE_REPO:-apm1368/petlife-os}"
idle_attempts="${FETCH_RELEASE_IDLE_ATTEMPTS:-8}"
speed_time="${FETCH_RELEASE_SPEED_TIME:-60}"
backoff_max="${FETCH_RELEASE_BACKOFF_MAX:-30}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "fetch-release: expected a full commit sha" >&2; exit 2; }
[[ -n "$dir" ]] || { echo "fetch-release: expected a target directory" >&2; exit 2; }
[[ "$parts" =~ ^[0-9]+$ ]] && (( parts >= 1 && parts <= 16 )) || { echo "fetch-release: FETCH_RELEASE_PARTS must be 1-16" >&2; exit 2; }
for n in "$idle_attempts" "$speed_time" "$backoff_max"; do
  [[ "$n" =~ ^[0-9]+$ ]] && (( n >= 1 )) || { echo "fetch-release: attempt and time settings must be positive integers" >&2; exit 2; }
done

name="release-$sha.tgz"
base="${FETCH_RELEASE_BASE_URL:-https://github.com/$repo/releases/download/deploy-builds/$name}"
out="$dir/$name"
mkdir -p "$dir"
rm -f "$out" "$out".part*

if [[ -n "${FETCH_RELEASE_BASE_URL:-}" ]]; then
  size="${FETCH_RELEASE_SIZE:-}"
else
  size="$(gh release view deploy-builds -R "$repo" --json assets --jq ".assets[] | select(.name == \"$name\") | .size")"
fi
[[ "$size" =~ ^[0-9]+$ ]] && (( size > 0 )) || { echo "fetch-release: $name is not on the deploy-builds release" >&2; exit 1; }
curl -fsSL --retry 5 --retry-delay 3 -o "$out.sha256" "$base.sha256"

# fetch_part <index> <first byte> <last byte>: fills "$out.part<index>" with exactly that byte range.
fetch_part() {
  local i="$1" start="$2" end="$3"
  local file="$out.part$i" try="$out.part$i.try"
  local want=$(( end - start + 1 )) have=0 got idle=0 attempts=0 code wait_s
  : > "$file"
  while (( have < want )); do
    attempts=$(( attempts + 1 ))
    # -L re-resolves the short-lived signed CDN URL on every attempt. A stalled transfer (<1 KB/s for $speed_time s)
    # ends the attempt; whatever arrived before the stall is kept, and the next attempt asks for the rest only.
    code="$(curl -sSL --connect-timeout 20 --speed-time "$speed_time" --speed-limit 1024 \
      -r "$(( start + have ))-$end" -o "$try" -w '%{http_code}' "$base" 2>/dev/null || true)"
    got=0
    [[ -f "$try" ]] && got="$(stat -c %s "$try")"
    # Only a 206 answer is this exact range. A 200 (range ignored) or an error page is never appended.
    if [[ "$code" == "206" ]] && (( got > 0 && have + got <= want )); then
      cat "$try" >> "$file"
      have=$(( have + got ))
      idle=0
    else
      idle=$(( idle + 1 ))
    fi
    rm -f "$try"
    if (( idle >= idle_attempts )); then
      echo "fetch-release: part $i ($start-$end) made no progress in $idle_attempts attempts in a row ($have of $want bytes, last HTTP ${code:-none})" >&2
      return 1
    fi
    if (( idle > 0 )); then
      wait_s=$(( idle * 3 ))
      (( wait_s <= backoff_max )) || wait_s="$backoff_max"
      sleep "$wait_s"
    fi
  done
  [[ "$(stat -c %s "$file")" -eq "$want" ]] || { echo "fetch-release: part $i has the wrong size" >&2; return 1; }
  (( attempts == 1 )) || echo "fetch-release: part $i complete after $attempts attempts" >&2
}

chunk=$(( (size + parts - 1) / parts ))
pids=()
for (( i = 0; i < parts; i++ )); do
  start=$(( i * chunk ))
  (( start < size )) || break
  end=$(( start + chunk - 1 ))
  (( end < size )) || end=$(( size - 1 ))
  fetch_part "$i" "$start" "$end" &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
(( failed == 0 )) || { rm -f "$out".part*; exit 1; }

for (( i = 0; i < ${#pids[@]}; i++ )); do cat "$out.part$i"; done > "$out"
rm -f "$out".part*
[[ "$(stat -c %s "$out")" -eq "$size" ]] || { echo "fetch-release: size mismatch" >&2; rm -f "$out"; exit 1; }
( cd "$dir" && sha256sum --quiet -c "$name.sha256" ) || { echo "fetch-release: checksum mismatch" >&2; rm -f "$out"; exit 1; }
echo "fetch-release: $name ($size bytes) in ${SECONDS}s"
