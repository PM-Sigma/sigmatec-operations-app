#!/usr/bin/env bash
# OWASP ZAP baseline scan — QA gate 5 (passive only; a full active scan is release-time).
# Binding threshold: 0 High / 0 Medium.
#
# Usage:   bash qa/zap/baseline.sh [port]
# Exit:    0 = clean · 1 = High/Medium findings · 2 = SKIPPED (no Docker on this machine)
#
# Exit code 2 is what scripts/qa.mjs reports as "SKIPPED (no Docker)" with a visible warning.
# It is NEVER silent, and it is the only gate allowed to skip.
set -uo pipefail
PORT="${1:-8124}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/.cache"
mkdir -p "$OUT"

if ! command -v docker >/dev/null 2>&1; then
  cat <<EOF

ZAP baseline SKIPPED — Docker is not installed on this machine.

To run this gate, install ONE of these, then re-run \`npm run qa\`:

  A. Docker (what this script uses):
       Windows: winget install --id Docker.DockerDesktop -e
       Linux:   sudo apt install docker.io
     then re-run:  bash qa/zap/baseline.sh

  B. ZAP itself, no Docker:
       Windows: winget install --id ZAP.ZAP -e
       Linux:   download from https://www.zaproxy.org/download/
     then, with the static server up (node qa/playwright/server.mjs $PORT):
       zap.sh -cmd -quickurl "http://127.0.0.1:$PORT/index.html?login=0&sb=0" \
              -quickprogress -quickout "$OUT/zap-baseline.html"

  Read the report and treat any High or Medium as a gate failure.

EOF
  exit 2
fi

SERVER_PID=""
if ! curl -sf "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1; then
  node "$ROOT/qa/playwright/server.mjs" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  sleep 2
fi
trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null' EXIT

# The server must be reachable from INSIDE the container, hence host.docker.internal.
docker run --rm \
  -v "$OUT:/zap/wrk:rw" \
  --add-host=host.docker.internal:host-gateway \
  zaproxy/zap-stable zap-baseline.py \
  -t "http://host.docker.internal:$PORT/index.html?login=0&sb=0" \
  -r zap-baseline.html -J zap-baseline.json \
  -l MEDIUM
code=$?
echo "ZAP baseline exit=$code · report: $OUT/zap-baseline.html"
exit $code
