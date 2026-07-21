#!/usr/bin/env bash
# PlainList plugin entry point: Focus Bay (YOLO26 phone detection).
# Creates a local venv on first run, installs deps, then serves UI + inference on :8800.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PL_YOLO_PORT:-8800}"

# Kill any stale process from a previous run that still holds our port.
# This happens when the parent API restarts (tsx watch) — the old detached
# child survives and keeps :8800 occupied.
echo "[focus-bay] Cleaning up stale processes on port $PORT..."
lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

PYTHON_BIN="${PL_PYTHON:-python3}"
VENV_DIR=".venv"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[focus-bay] creating venv..."
  # Fully isolated venv: mixing system site-packages pulls in duplicate
  # OpenMP runtimes on macOS and crashes torch inference (SIGSEGV).
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# Install deps only when requirements change (marker file keeps restarts fast).
REQ_HASH="$(shasum requirements.txt | awk '{print $1}')"
MARKER="$VENV_DIR/.req-$REQ_HASH"
if [ ! -f "$MARKER" ]; then
  echo "[focus-bay] installing requirements..."
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  "$VENV_DIR/bin/pip" install --quiet -r requirements.txt
  rm -f "$VENV_DIR"/.req-* 2>/dev/null || true
  touch "$MARKER"
fi

echo "[focus-bay] starting server on :$PORT"
exec "$VENV_DIR/bin/python" server.py
