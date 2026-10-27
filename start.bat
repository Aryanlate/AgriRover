@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Starting Autonomous Agri-Rover System
echo   FastAPI Backend + React Web Dashboard
echo ===================================================

set "ROOT_DIR=%~dp0"

echo [1/3] Starting FastAPI backend on http://localhost:8000 ...
cd /d "%ROOT_DIR%backend"
start "AgriRover-Backend" cmd /k "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Starting React frontend on http://localhost:5173 ...
cd /d "%ROOT_DIR%frontend"
start "AgriRover-Frontend" cmd /k "npm run dev"

echo [3/3] Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening Agri-Rover Web Dashboard...
start http://localhost:5173

echo.
echo ===================================================
echo   Agri-Rover is running!
echo   - Web Dashboard: http://localhost:5173
echo   - Backend API:   http://localhost:8000
echo   - API Docs:      http://localhost:8000/docs
echo ===================================================
echo Keep the backend and frontend command windows open.
echo.
pause
