#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="com.interactiveaiassistant"
APK_PATH="$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
OUTPUT_DIRECTORY="$PROJECT_ROOT/evaluation-results"
METRO_PORT="${ALAB_EVAL_METRO_PORT:-8081}"
TIMEOUT_SECONDS="${ALAB_EVAL_TIMEOUT_SECONDS:-3600}"
DEVICE_SERIAL="${ANDROID_SERIAL:-}"
SHOULD_BUILD=true
METRO_PID=""

usage() {
  echo "Usage: npm run eval:qwen -- [--device SERIAL] [--no-build] [--timeout SECONDS]"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --device|-d)
      if [ "$#" -lt 2 ]; then
        echo "--device requires an adb serial." >&2
        exit 1
      fi
      DEVICE_SERIAL="$2"
      shift 2
      ;;
    --no-build)
      SHOULD_BUILD=false
      shift
      ;;
    --timeout)
      if [ "$#" -lt 2 ]; then
        echo "--timeout requires a number of seconds." >&2
        exit 1
      fi
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cleanup() {
  if [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null; then
    kill "$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! command -v adb >/dev/null 2>&1; then
  echo "adb was not found. Install Android platform-tools first." >&2
  exit 1
fi

if [ -z "$DEVICE_SERIAL" ]; then
  DEVICE_SERIAL="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi

if [ -z "$DEVICE_SERIAL" ]; then
  echo "No authorized Android device or emulator was found." >&2
  echo "Start an emulator or connect a phone with USB debugging, then run this command again." >&2
  exit 1
fi

if ! adb -s "$DEVICE_SERIAL" get-state 2>/dev/null | grep -q '^device$'; then
  echo "Android target $DEVICE_SERIAL is not ready or authorized." >&2
  exit 1
fi

echo "Using Android target: $DEVICE_SERIAL"

if [ "$SHOULD_BUILD" = true ]; then
  echo "Building the debug APK..."
  (cd "$PROJECT_ROOT" && npm run apk:debug)
elif [ ! -f "$APK_PATH" ]; then
  echo "The debug APK does not exist. Run without --no-build once." >&2
  exit 1
fi

echo "Installing the APK while preserving downloaded model files..."
adb -s "$DEVICE_SERIAL" install -r "$APK_PATH" >/dev/null
adb -s "$DEVICE_SERIAL" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
REPORT_FILE="alab-qwen-evaluation-$RUN_ID.json"
DONE_FILE="alab-qwen-evaluation-$RUN_ID.done"
STATUS_FILE="alab-qwen-evaluation-status.json"
METRO_LOG="/tmp/alab-qwen-eval-metro-$RUN_ID.log"

echo "Starting Expo Metro on port $METRO_PORT..."
(
  cd "$PROJECT_ROOT"
  CI=1 npx expo start --dev-client --port "$METRO_PORT"
) >"$METRO_LOG" 2>&1 &
METRO_PID=$!

sleep 4

if ! kill -0 "$METRO_PID" 2>/dev/null; then
  METRO_PID=""

  if ! curl -fsS "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q 'packager-status:running'; then
    echo "Metro did not start. Its log follows:" >&2
    sed -n '1,160p' "$METRO_LOG" >&2
    exit 1
  fi

  echo "Using the Metro server already running on port $METRO_PORT."
fi

echo "Launching the headless evaluation route..."
adb -s "$DEVICE_SERIAL" shell am force-stop "$PACKAGE_NAME"
adb -s "$DEVICE_SERIAL" shell am start -W \
  -a android.intent.action.VIEW \
  -d "projectalab://evaluate?runId=$RUN_ID" \
  "$PACKAGE_NAME" >/dev/null

echo "The first run may download several gigabytes of model files. Keep the device connected."
echo "Evaluation run: $RUN_ID"

STARTED_AT="$(date +%s)"
LAST_STATUS=""

while true; do
  if adb -s "$DEVICE_SERIAL" shell run-as "$PACKAGE_NAME" \
    test -f "files/$DONE_FILE" 2>/dev/null; then
    break
  fi

  NOW="$(date +%s)"

  if [ $((NOW - STARTED_AT)) -ge "$TIMEOUT_SECONDS" ]; then
    echo "Evaluation timed out after $TIMEOUT_SECONDS seconds." >&2
    echo "Recent app logs:" >&2
    adb -s "$DEVICE_SERIAL" logcat -d -t 120 ReactNativeJS:I '*:S' >&2 || true
    exit 1
  fi

  CURRENT_STATUS="$(
    adb -s "$DEVICE_SERIAL" shell run-as "$PACKAGE_NAME" \
      cat "files/$STATUS_FILE" 2>/dev/null | tr -d '\r' || true
  )"

  if [ -n "$CURRENT_STATUS" ] && [ "$CURRENT_STATUS" != "$LAST_STATUS" ]; then
    if printf '%s' "$CURRENT_STATUS" | grep -q "\"runId\":\"$RUN_ID\""; then
      echo "$CURRENT_STATUS"
      LAST_STATUS="$CURRENT_STATUS"
    fi
  fi

  sleep 5
done

mkdir -p "$OUTPUT_DIRECTORY"
OUTPUT_PATH="$OUTPUT_DIRECTORY/$RUN_ID.json"
adb -s "$DEVICE_SERIAL" exec-out run-as "$PACKAGE_NAME" \
  cat "files/$REPORT_FILE" >"$OUTPUT_PATH"

echo
node "$PROJECT_ROOT/scripts/print-qwen-eval-report.js" "$OUTPUT_PATH"
echo
echo "Full report: $OUTPUT_PATH"
