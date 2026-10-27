#!/usr/bin/env bash
set -e

# Resolve repository root directory
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

echo "==================================================="
echo "  Starting Autonomous Agri-Rover System"
echo "  FastAPI Backend + React Web Dashboard"
echo "==================================================="

# Process cleanup handler on exit or SIGINT
cleanup() {
    echo ""
    echo "Shutting down Agri-Rover servers..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start FastAPI backend
echo "[1/3] Starting FastAPI backend on http://localhost:8000..."
cd "$DIR/backend"
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d "../venv" ]; then
    source ../venv/bin/activate
fi
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 2. Start Vite frontend
echo "[2/3] Starting React frontend on http://localhost:5173..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# 3. Open browser
echo "[3/3] Opening browser at http://localhost:5173..."
sleep 3
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:5173" >/dev/null 2>&1 &
fi

echo ""
echo "==================================================="
echo "  Agri-Rover is running!"
echo "  - Web Dashboard: http://localhost:5173"
echo "  - Backend API:   http://localhost:8000"
echo "  - API Docs:      http://localhost:8000/docs"
echo "==================================================="
echo "Press Ctrl+C to stop all servers."

wait
