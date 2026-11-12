#!/bin/bash
# The one-minute reel, one (language, format) per lock hold. Usage: reel-worker.sh <music.mp3> <locales...>
cd "$(dirname "$0")"
M="$1"; shift
for l in "$@"; do
  for f in 9x16 16x9; do
    ./lockrun.sh node reel.js $l $f --music "$M" --start 8 2>&1 | grep -E "^reel|^audio|Error" || echo "FAILED reel $l $f"
  done
done
echo "reel-worker done: $*"
