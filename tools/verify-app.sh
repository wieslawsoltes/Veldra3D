#!/usr/bin/env bash
# Verify only real committed functionality; no GPU mocks or success-on-skip.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROMIUM="${CHROMIUM:-/usr/bin/chromium}"
if [[ ! -x "$CHROMIUM" ]]; then
  echo "Set CHROMIUM to an installed Chromium executable." >&2
  exit 1
fi
node tools/check-cad-availability.mjs
npm test | tee tests/node-test-results.tap
mkdir -p examples
if [[ ! -f examples/Canopy.veldra || ! -f examples/Canopy.weave || ! -f examples/Surface-laboratory.veldra ]]; then
  node tools/examples.mjs
fi
npm run build
python3 tests/browser_smoke.py --chromium "$CHROMIUM" | tee tests/browser-standalone-console.txt
cp tests/browser-results.json tests/browser-standalone-results.json
python3 tests/final-render-browser.py --chromium "$CHROMIUM" | tee tests/final-render-standalone-console.txt
cp tests/final-render-browser-results.json tests/final-render-standalone-results.json
npm run build:pages
PREVIEW=$(mktemp -d)
SERVER_PID=''
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$PREVIEW"
}
trap cleanup EXIT
mkdir "$PREVIEW/Veldra3D"
cp -R _site/. "$PREVIEW/Veldra3D/"
python3 -u - "$PREVIEW" <<'PY' > "$PREVIEW/server.log" 2>&1 &
import functools, http.server, pathlib, sys
root = pathlib.Path(sys.argv[1])
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
(root / 'port.txt').write_text(str(server.server_address[1]))
server.serve_forever()
PY
SERVER_PID=$!
for _ in $(seq 1 100); do
  [[ -s "$PREVIEW/port.txt" ]] && break
  kill -0 "$SERVER_PID" 2>/dev/null || { cat "$PREVIEW/server.log"; exit 1; }
  sleep .1
done
[[ -s "$PREVIEW/port.txt" ]] || { echo 'Preview server did not start' >&2; exit 1; }
URL="http://127.0.0.1:$(cat "$PREVIEW/port.txt")/Veldra3D/?fresh"
python3 tests/browser_smoke.py --chromium "$CHROMIUM" --url "$URL" | tee tests/browser-console.txt
python3 tests/final-render-browser.py --chromium "$CHROMIUM" --url "$URL" | tee tests/final-render-module-console.txt
cp tests/final-render-browser-results.json tests/final-render-module-results.json
python3 tests/final-render-browser.py --chromium "$CHROMIUM" --url "$URL" --require-webgpu | tee tests/final-render-webgpu-console.txt
cp tests/final-render-browser-results.json tests/final-render-webgpu-results.json
node tools/benchmark.mjs | tee tests/benchmark-console.txt
