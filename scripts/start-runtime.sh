#!/bin/sh
set -eu

BGUTIL_PID=""
APP_PID=""

terminate_children() {
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi

  if [ -n "$BGUTIL_PID" ]; then
    kill "$BGUTIL_PID" 2>/dev/null || true
  fi
}

trap 'terminate_children' INT TERM

if [ "${YTDLP_YOUTUBE_BGUTIL_ENABLED:-0}" = "1" ] && [ -f /opt/bgutil-provider/server/build/main.js ]; then
  node /app/scripts/start-bgutil.mjs --port 4416 &
  BGUTIL_PID="$!"
fi

node server.js &
APP_PID="$!"

wait "$APP_PID"
STATUS="$?"

terminate_children

if [ -n "$BGUTIL_PID" ]; then
  wait "$BGUTIL_PID" 2>/dev/null || true
fi

exit "$STATUS"
