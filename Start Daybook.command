#!/bin/zsh
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print "Daybook requires Node.js 22.13 or newer. Install it from https://nodejs.org."
  read "?Press Enter to close."
  exit 1
fi
if test ! -x "Daybook Capture.app/Contents/MacOS/DaybookCapture"; then
  ./mac/build.sh || print "Quick capture could not be built. The browser planner will still open."
fi
start_capture() {
  if test -x "Daybook Capture.app/Contents/MacOS/DaybookCapture"; then
    open -g "Daybook Capture.app" --args --background
  fi
}
DAYBOOK_HOSTED_URL="$(node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
try {
  const config = JSON.parse(readFileSync('Daybook Capture.app/Contents/Resources/configuration.json', 'utf8'));
  const url = new URL(config.webURL);
  if (url.protocol === 'https:') process.stdout.write(url.href);
} catch {}
JS
)"
if [[ -n "$DAYBOOK_HOSTED_URL" ]]; then
  start_capture
  open "$DAYBOOK_HOSTED_URL"
  exit 0
fi
if curl -fsS http://127.0.0.1:4399/api/state >/dev/null 2>&1; then
  start_capture
  open http://127.0.0.1:4399
  exit 0
fi
node server.js &
DAYBOOK_PID=$!
trap 'kill "$DAYBOOK_PID" 2>/dev/null' EXIT INT TERM
for attempt in {1..40}; do
  if curl -fsS http://127.0.0.1:4399/api/state >/dev/null 2>&1; then
    start_capture
    open http://127.0.0.1:4399
    break
  fi
  sleep 0.25
done
wait "$DAYBOOK_PID"
