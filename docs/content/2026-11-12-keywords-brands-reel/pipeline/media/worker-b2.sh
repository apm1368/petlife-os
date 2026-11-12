#!/bin/bash
# Batch B articles: infographic + video per (article, language), each via lockrun.sh. Usage: worker-b2.sh <ids...>
cd "$(dirname "$0")"
for id in "$@"; do
  for l in fa en de es; do
    ./lockrun.sh node render.js infographics $id $l >/dev/null 2>&1 || echo "FAILED infographic $id $l"
    if [ "$id" != "32" ]; then
      ./lockrun.sh node render.js videos $id $l 2>&1 | grep -E "^video|Error" || echo "FAILED video $id $l"
    fi
  done
done
echo "worker-b2 done: $*"
