#!/bin/bash
# Run ONE render under a shared hold of the production build lock, but never start while a deploy is running or
# waiting: flock has no writer priority, so back-to-back shared holds can starve deploy.sh (see 2026-11-12).
deploying() { pgrep -f '^(/usr/bin/)?bash (/[^ ]*/)?deploy\.sh' >/dev/null || grep -q " 00:1a:6 " /proc/locks; }
while deploying; do sleep 20; done
sleep 8   # leave a gap so a deploy that starts right now can grab the lock first
deploying && exec "$0" "$@"
exec flock -s /var/lock/petlife-build.lock nice -n 10 "$@"
