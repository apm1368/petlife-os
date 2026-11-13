#!/bin/bash
# After reel-arnl-worker: (A) re-render the recap segments (40–60 s) of reels finished before the recap-wrap fix,
# then (B) Arabic/Dutch article infographics + clips. One job at a time via lockrun.sh.
cd "$(dirname "$0")"
M=/root/opetlife-content-pipeline/batches/2026-11-12-keywords-brands-reel/music/happy-dance-holiznacc0-cc0.mp3
while pgrep -f "^/bin/bash ./reel-arnl-worker.sh" >/dev/null; do sleep 15; done
fix() { # locale format
  for from in 40 50; do
    rm -f out/reel/parts/$1-$2-$from.bin; [ "$2" = "16x9" ] && rm -f out/reel/parts/$1-site-$from.bin
    ./lockrun.sh node reel.js $1 $2 --from $from --to $((from + 10)) 2>&1 | grep -E "^part|Error" || echo "FAILED part $1 $2 $from"
  done
  ./lockrun.sh node reel.js $1 $2 --assemble --music "$M" --start 8 2>&1 | grep -E "^reel|Error" || echo "FAILED assemble $1 $2"
}
for l in de es fa en; do fix $l 16x9; done
fix ar 16x9
for l in de es fa en; do fix $l 9x16; done
echo "recap fix done"
for id in 21 22 23 24 25 26 27 28 29 30 31 32; do
  for l in ar nl; do
    [ -f out/infographics/$id-$l.webp ] || ./lockrun.sh node render.js infographics $id $l >/dev/null 2>&1 || echo "FAILED infographic $id $l"
    if [ "$id" != "32" ] && [ ! -f out/videos/$id-$l.webm ]; then
      ./lockrun.sh node render.js videos $id $l 2>&1 | grep -E "^video|Error" || echo "FAILED video $id $l"
    fi
  done
done
echo "final-worker done"
