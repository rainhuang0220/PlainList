#!/usr/bin/env bash
# PlainList dev 一键重置脚本
# 杀掉所有相关进程，重新 seed，并以 WIDGET_UPDATE=1 启动 dev。
# 解决 widget 子进程残留、端口占用、前端缓存导致的 500/503/404。

set -euo pipefail

cd "$(dirname "$0")/.."

PORTS=(3000 3001 5173 5174 5175 5176 5177 5178 5179 8000 8001 8800)

echo "[dev-reset] Killing stale dev/widget processes on ports ${PORTS[*]}..."
for p in "${PORTS[@]}"; do
  lsof -ti:"$p" 2>/dev/null | xargs kill -9 2>/dev/null || true
done

# Also kill any node/python widget sidecars that may be detached from tsx watch.
echo "[dev-reset] Killing orphaned widget sidecars..."
pgrep -f 'vite preview --port 5174' | xargs kill -9 2>/dev/null || true
pgrep -f 'uvicorn backend.main:app --port 8000' | xargs kill -9 2>/dev/null || true
pgrep -f 'focus-bay' | xargs kill -9 2>/dev/null || true
sleep 1

echo "[dev-reset] Verifying ports are free..."
BUSY=0
for p in "${PORTS[@]}"; do
  if lsof -ti:"$p" >/dev/null 2>&1; then
    echo "  WARNING: port $p is still in use"
    BUSY=1
  fi
done
[ "$BUSY" -eq 1 ] && echo "[dev-reset] Some ports could not be freed; continuing anyway..."

echo "[dev-reset] Re-seeding marketplace manifest (including widgetUrl)..."
npm run db:seed

echo "[dev-reset] Starting PlainList dev with widget update..."
echo "[dev-reset] Use Ctrl+C once to stop all processes."
WIDGET_UPDATE=1 npm run dev
