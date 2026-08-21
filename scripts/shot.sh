#!/usr/bin/env bash
# Captures a headless screenshot of the running game.
# Usage: shot.sh <out.png> [virtual-time-ms] [url]
set -euo pipefail
OUT="${1:-shots/frame.png}"
VT="${2:-8000}"
URL="${3:-http://127.0.0.1:5173/?auto=1}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d)"
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --enable-unsafe-swiftshader \
  --use-angle=swiftshader \
  --user-data-dir="$PROFILE" \
  --window-size=1280,720 \
  --hide-scrollbars \
  --screenshot="$OUT" \
  --virtual-time-budget="$VT" \
  "$URL" 2>/dev/null &
CHPID=$!
# Chrome sometimes doesn't exit after --screenshot; give it a bounded window.
sleep 30
kill "$CHPID" 2>/dev/null || true
rm -rf "$PROFILE" 2>/dev/null || true
if [ -f "$OUT" ]; then echo "captured: $OUT"; else echo "FAILED: no screenshot"; exit 1; fi
