#!/usr/bin/env bash
# AFL Squiggle Predictor — start backend + frontend
# Usage: ./start.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/venv"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ── Colours ────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

log()  { echo -e "${CYAN}[afl]${RESET} $*"; }
ok()   { echo -e "${GREEN}[afl]${RESET} $*"; }
warn() { echo -e "${YELLOW}[afl]${RESET} $*"; }
err()  { echo -e "${RED}[afl]${RESET} $*"; }

# ── Cleanup on exit ────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  log "Shutting down..."
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null && log "Backend stopped"
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && log "Frontend stopped"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Check Python venv ──────────────────────────────────────────────────────
if [ ! -f "$VENV/bin/activate" ]; then
  warn "No venv found at $VENV"
  log "Creating virtual environment..."
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

# Install Python deps if needed
if ! python -c "import fastapi" 2>/dev/null; then
  log "Installing Python dependencies..."
  pip install -r "$BACKEND/requirements.txt" -q
fi

# ── Check Node / npm ───────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  # Try Homebrew path
  export PATH="/opt/homebrew/bin:$PATH"
fi

if ! command -v npm &>/dev/null; then
  err "npm not found. Install Node.js first: brew install node"
  exit 1
fi

# Install frontend deps if needed
if [ ! -d "$FRONTEND/node_modules" ]; then
  log "Installing frontend dependencies..."
  (cd "$FRONTEND" && npm install -q)
fi

# ── Start backend ──────────────────────────────────────────────────────────
log "Starting backend on http://localhost:8000 ..."
(cd "$BACKEND" && uvicorn api.main:app --reload --port 8000 2>&1 | sed "s/^/${CYAN}[backend]${RESET} /") &
BACKEND_PID=$!

# Wait for backend to be ready
for i in {1..15}; do
  if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    ok "Backend ready"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    err "Backend failed to start. Check logs above."
    cleanup
  fi
done

# ── Start frontend ─────────────────────────────────────────────────────────
log "Starting frontend on http://localhost:5173 ..."
(cd "$FRONTEND" && npm run dev 2>&1 | sed "s/^/${GREEN}[frontend]${RESET} /") &
FRONTEND_PID=$!

echo ""
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "  🏉 AFL Predictor running"
ok "  Frontend → http://localhost:5173"
ok "  Backend  → http://localhost:8000"
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Press Ctrl+C to stop both servers"

# Wait for either process to exit
wait $BACKEND_PID $FRONTEND_PID
