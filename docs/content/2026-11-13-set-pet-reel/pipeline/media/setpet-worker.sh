#!/bin/bash
# Set Pet reel: render 10 s segments one at a time through lockrun (never during a deploy), assemble each
# language/format with the music as soon as its 9 segments exist, then delete those segments.
# Disk guard: starts only with >= 3 GB free and pauses whenever free space drops below 2 GB.
cd /root/opetlife-content-pipeline/media || exit 1
OUT=out/setpet; LOG=$OUT/worker.log
MUSIC=/root/opetlife-content-pipeline/batches/2026-11-12-keywords-brands-reel/music/happy-dance-holiznacc0-cc0.mp3
free_kb() { df --output=avail -k / | tail -1; }
# The whole deploy pipeline counts as "deploying": the CI ssh job (release download via fetch-release.sh or
# gh release download), deploy.sh itself and the smoke test. lockrun.sh additionally checks the build lock.
# Claude Code shell wrappers (bash -c "source ~/.claude/shell-snapshots/...") carry the text of whatever command a
# session runs, including the command that launched this worker, so they are excluded; a real deploy.sh or
# fetch-release.sh started from such a wrapper still matches as its own process.
deploy_busy() { pgrep -af 'DRONE_SSH_PREV_COMMAND_EXIT_CODE|fetch-release\.sh|gh release download|/deploy\.sh|smoke-production\.sh' | grep -v -e '\.claude/shell-snapshots' -e 'setpet-worker' | grep -q .; }
wait_deploy() { local w=0; while deploy_busy; do [ $w = 0 ] && echo "$(date -u +%T) deploy pipeline running - waiting" >>"$LOG"; w=1; sleep 30; done; [ $w = 1 ] && { echo "$(date -u +%T) deploy finished - resuming after 60 s" >>"$LOG"; sleep 60; }; return 0; }
need() { while [ "$(free_kb)" -lt "$1" ]; do echo "$(date -u +%T) waiting for disk: $(df -h --output=avail / | tail -1 | tr -d ' ') free" >>"$LOG"; sleep 120; done; }
echo "$(date -u +%T) worker $$ start" >>"$LOG"
need 3000000
for fmt in 16x9 9x16; do
  for l in fa en de es ar nl; do
    if [ -s "$OUT/setpet-$l-$fmt.webm" ]; then continue; fi
    for from in 0 10 20 30 40 50 60 70 80; do
      [ -s "$OUT/parts/$l-$fmt-$(printf %02d $from).bin" ] && continue
      need 2000000; wait_deploy
      ./lockrun.sh node setpet-reel.js "$l" "$fmt" --from "$from" --to $((from + 10)) >>"$LOG" 2>&1 || { echo "$(date -u +%T) FAIL $l $fmt $from" >>"$LOG"; exit 1; }
    done
    need 1500000; wait_deploy
    ./lockrun.sh node setpet-reel.js "$l" "$fmt" --assemble --music "$MUSIC" --start 10 >>"$LOG" 2>&1 || { echo "$(date -u +%T) FAIL assemble $l $fmt" >>"$LOG"; exit 1; }
    # Segments are kept until every file is final (KEEP_PARTS=1 default), so a change to one scene only re-renders
    # its own segments; delete with: rm -f out/setpet/parts/*.bin
    [ "${KEEP_PARTS:-1}" = 1 ] || rm -f "$OUT"/parts/"$l"-"$fmt"-*.bin "$OUT"/parts/"$l"-site-*.bin
  done
done
echo "$(date -u +%T) ALL DONE" >>"$LOG"
