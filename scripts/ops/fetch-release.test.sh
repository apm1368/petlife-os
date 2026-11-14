#!/usr/bin/env bash
# Tests scripts/ops/fetch-release.sh against a local HTTP server that answers byte ranges and misbehaves on purpose:
#   1. connections that drop after part of a range, plus a stall: every part must resume from where it stopped and
#      the archive must come out byte-identical (the 2026-11-13 failure: stalled parts restarted from zero and the
#      whole download was thrown away);
#   2. a corrupted body: the checksum must still refuse it;
#   3. a server that ignores Range (HTTP 200): nothing may be appended, and the part gives up after its idle limit.
# Needs bash, curl, python3 and sha256sum only. Runs in CI ("Test release download resume") in a few seconds.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fetch="$here/fetch-release.sh"
work="$(mktemp -d)"
server_pid=""
cleanup() { [[ -n "$server_pid" ]] && kill "$server_pid" 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT

sha="0123456789abcdef0123456789abcdef01234567"
name="release-$sha.tgz"
mkdir -p "$work/srv"
head -c 3000000 /dev/urandom > "$work/srv/$name"
( cd "$work/srv" && sha256sum "$name" > "$name.sha256" )
size="$(stat -c %s "$work/srv/$name")"

cat > "$work/server.py" <<'PY'
import os, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root, mode, log_path = sys.argv[1], sys.argv[2], sys.argv[3]
lock = threading.Lock()
count = {"n": 0}

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *args):
        pass
    def do_GET(self):
        path = os.path.join(root, os.path.basename(self.path))
        if not os.path.isfile(path):
            self.send_response(404); self.send_header("Content-Length", "0"); self.end_headers(); return
        data = open(path, "rb").read()
        if path.endswith(".sha256"):
            self.send_response(200); self.send_header("Content-Length", str(len(data))); self.end_headers()
            self.wfile.write(data); return
        if mode == "corrupt":
            data = bytes([data[0] ^ 0xFF]) + data[1:]
        m = re.match(r"bytes=(\d+)-(\d+)$", self.headers.get("Range", ""))
        if mode == "norange" or not m:
            self.send_response(200); self.send_header("Content-Length", str(len(data))); self.end_headers()
            self.wfile.write(data); return
        a, b = int(m.group(1)), int(m.group(2))
        body = data[a:b + 1]
        with lock:
            count["n"] += 1
            n = count["n"]
            with open(log_path, "a") as log:
                log.write(f"{a}\n")
        self.send_response(206)
        self.send_header("Content-Range", f"bytes {a}-{b}/{len(data)}")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            if mode == "flaky" and n <= 6:
                # Drop the connection after 30% of the range (curl: "transfer closed with bytes remaining").
                self.wfile.write(body[: len(body) * 3 // 10]); self.wfile.flush()
                self.close_connection = True
                return
            if mode == "flaky" and n == 7:
                # Stall: 20% then silence, longer than the client's stall window.
                self.wfile.write(body[: len(body) // 5]); self.wfile.flush()
                time.sleep(4)
                self.close_connection = True
                return
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(server.server_address[1], flush=True)
server.serve_forever()
PY

start_server() {
  : > "$work/ranges.log"
  python3 "$work/server.py" "$work/srv" "$1" "$work/ranges.log" > "$work/port" &
  server_pid="$!"
  for _ in $(seq 1 50); do [[ -s "$work/port" ]] && break; sleep 0.1; done
  port="$(cat "$work/port")"
}
stop_server() { kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; server_pid=""; rm -f "$work/port"; }
run_fetch() {
  FETCH_RELEASE_BASE_URL="http://127.0.0.1:$port/$name" FETCH_RELEASE_SIZE="$size" FETCH_RELEASE_PARTS=4 \
    FETCH_RELEASE_SPEED_TIME=1 FETCH_RELEASE_BACKOFF_MAX=1 FETCH_RELEASE_IDLE_ATTEMPTS=3 \
    bash "$fetch" "$sha" "$work/out" > "$work/stdout" 2> "$work/stderr"
}
fail() { echo "fetch-release.test: FAIL: $*" >&2; cat "$work/stderr" >&2 || true; exit 1; }

# 1. Drops and a stall: every part resumes and the archive is byte-identical.
start_server flaky
run_fetch || fail "download with dropped and stalled connections did not complete"
cmp -s "$work/out/$name" "$work/srv/$name" || fail "downloaded archive differs from the original"
chunk=$(( (size + 3) / 4 ))
resumed=0
while read -r a; do (( a % chunk == 0 )) || resumed=$(( resumed + 1 )); done < "$work/ranges.log"
(( resumed >= 6 )) || fail "expected resumed range requests (not from a part's start), saw $resumed"
grep -q "complete after" "$work/stderr" || fail "expected a part to report completing after retries"
stop_server
rm -rf "$work/out"
echo "fetch-release.test: ok - dropped and stalled parts resumed ($resumed resumed requests), archive identical"

# 2. Corrupted body: the checksum refuses it and nothing is left behind as the archive.
start_server corrupt
if run_fetch; then fail "a corrupted archive was accepted"; fi
grep -q "checksum mismatch" "$work/stderr" || fail "expected a checksum mismatch"
[[ ! -e "$work/out/$name" ]] || fail "a corrupted archive was left behind"
stop_server
rm -rf "$work/out"
echo "fetch-release.test: ok - corrupted archive refused by the checksum"

# 3. Range ignored (HTTP 200 with the whole file): nothing is appended; the part gives up after its idle limit.
start_server norange
if run_fetch; then fail "a server that ignores Range was accepted"; fi
grep -q "made no progress in 3 attempts" "$work/stderr" || fail "expected the idle limit to stop the part"
[[ ! -e "$work/out/$name" ]] || fail "an archive was assembled from wrong data"
ls "$work/out"/*.part* >/dev/null 2>&1 && fail "part files were left behind"
stop_server
echo "fetch-release.test: ok - a server that ignores Range is refused without appending its body"
