#!/usr/bin/env bash
# Downloads the CI-built release archive of one commit from the deploy-builds pre-release, as several parallel range
# requests. From the VPS a single connection to GitHub's release CDN runs at ~100 KB/s, so a 160 MB archive took
# about 25 minutes, while four connections together reached ~400 KB/s (measured 2026-11-12). The archive is checked
# against its .sha256 here, and deploy.sh checks it again before installing it.
# Usage: fetch-release.sh <40-char sha> <dir>. Exit 0 = "$dir/release-<sha>.tgz" and its .sha256 are complete.
set -euo pipefail

sha="${1:-}"
dir="${2:-}"
parts="${FETCH_RELEASE_PARTS:-8}"
repo="${FETCH_RELEASE_REPO:-apm1368/petlife-os}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "fetch-release: expected a full commit sha" >&2; exit 2; }
[[ -n "$dir" ]] || { echo "fetch-release: expected a target directory" >&2; exit 2; }
[[ "$parts" =~ ^[0-9]+$ ]] && (( parts >= 1 && parts <= 16 )) || { echo "fetch-release: FETCH_RELEASE_PARTS must be 1-16" >&2; exit 2; }

name="release-$sha.tgz"
base="https://github.com/$repo/releases/download/deploy-builds/$name"
out="$dir/$name"
mkdir -p "$dir"
rm -f "$out" "$out".part*

size="$(gh release view deploy-builds -R "$repo" --json assets --jq ".assets[] | select(.name == \"$name\") | .size")"
[[ "$size" =~ ^[0-9]+$ ]] && (( size > 0 )) || { echo "fetch-release: $name is not on the deploy-builds release" >&2; exit 1; }
curl -fsSL --retry 5 --retry-delay 3 -o "$out.sha256" "$base.sha256"

chunk=$(( (size + parts - 1) / parts ))
pids=()
for (( i = 0; i < parts; i++ )); do
  start=$(( i * chunk ))
  (( start < size )) || break
  end=$(( start + chunk - 1 ))
  (( end < size )) || end=$(( size - 1 ))
  (
    want=$(( end - start + 1 ))
    for attempt in 1 2 3 4 5; do
      # -L re-resolves the short-lived signed CDN URL on every attempt; a stalled transfer (<1 KB/s for 60 s) retries.
      if curl -fsSL --connect-timeout 20 --speed-time 60 --speed-limit 1024 -r "$start-$end" -o "$out.part$i" "$base" \
        && [[ "$(stat -c %s "$out.part$i")" -eq "$want" ]]; then
        exit 0
      fi
      sleep $(( attempt * 3 ))
    done
    echo "fetch-release: part $i ($start-$end) failed" >&2
    exit 1
  ) &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
(( failed == 0 )) || { rm -f "$out".part*; exit 1; }

for (( i = 0; i < ${#pids[@]}; i++ )); do cat "$out.part$i"; done > "$out"
rm -f "$out".part*
[[ "$(stat -c %s "$out")" -eq "$size" ]] || { echo "fetch-release: size mismatch" >&2; exit 1; }
( cd "$dir" && sha256sum --quiet -c "$name.sha256" ) || { echo "fetch-release: checksum mismatch" >&2; exit 1; }
echo "fetch-release: $name ($size bytes) in ${SECONDS}s"
