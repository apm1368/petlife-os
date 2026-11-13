#!/bin/bash
# Remaining batch renders, strictly one SHORT job at a time via lockrun.sh (deploy-aware, gap between jobs):
# article media, then the reel in 10 s segments (≈2 min each) + a short assemble per language/format.
cd "$(dirname "$0")"
M=/root/opetlife-content-pipeline/batches/2026-11-12-keywords-brands-reel/music/happy-dance-holiznacc0-cc0.mp3
while pgrep -f "^node (render|reel)\.js" >/dev/null; do sleep 10; done
for id in 24 25 26 27 28 29 30 31 32; do
  for l in fa en de es; do
    [ -f out/infographics/$id-$l.webp ] || ./lockrun.sh node render.js infographics $id $l >/dev/null 2>&1 || echo "FAILED infographic $id $l"
    if [ "$id" != "32" ] && [ ! -f out/videos/$id-$l.webm ]; then
      ./lockrun.sh node render.js videos $id $l 2>&1 | grep -E "^video|Error" || echo "FAILED video $id $l"
    fi
  done
done
echo "articles done"
reel() { # locale format
  for from in 0 10 20 30 40 50; do
    [ -f "out/reel/parts/$1-$2-$(printf %02d $from).bin" ] || ./lockrun.sh node reel.js $1 $2 --from $from --to $((from + 10)) 2>&1 | grep -E "^part|Error" || echo "FAILED part $1 $2 $from"
  done
  ./lockrun.sh node reel.js $1 $2 --assemble --music "$M" --start 8 2>&1 | grep -E "^reel|Error" || echo "FAILED assemble $1 $2"
}
for l in fa en de es; do reel $l 16x9; done
echo "reel 16x9 done"
for l in fa en de es; do reel $l 9x16; done
echo "rest-worker done"
