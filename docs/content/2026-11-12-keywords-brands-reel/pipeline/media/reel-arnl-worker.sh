#!/bin/bash
# Arabic + Dutch reel versions (16:9 + site, then 9:16), in 10 s segments via lockrun.sh. Starts after rest-worker.
cd "$(dirname "$0")"
M=/root/opetlife-content-pipeline/batches/2026-11-12-keywords-brands-reel/music/happy-dance-holiznacc0-cc0.mp3
while pgrep -f "^/bin/bash ./rest-worker.sh" >/dev/null; do sleep 15; done
reel() {
  for from in 0 10 20 30 40 50; do
    [ -f "out/reel/parts/$1-$2-$(printf %02d $from).bin" ] || ./lockrun.sh node reel.js $1 $2 --from $from --to $((from + 10)) 2>&1 | grep -E "^part|Error" || echo "FAILED part $1 $2 $from"
  done
  ./lockrun.sh node reel.js $1 $2 --assemble --music "$M" --start 8 2>&1 | grep -E "^reel|Error" || echo "FAILED assemble $1 $2"
}
for l in ar nl; do reel $l 16x9; done
for l in ar nl; do reel $l 9x16; done
echo "reel-arnl done"
