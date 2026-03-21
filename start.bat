@echo off
title TapNow Clone

echo.
echo  ================================
echo   TapNow Clone - AI Visual Creator
echo  ================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js
    pause
    exit /b 1
)

:: Set paths
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%~dp0backend"
set "FRONTEND_DIR=%~dp0frontend"

:: Install backend dependencies
echo [Step 1/3] Installing backend dependencies...
cd /d "%BACKEND_DIR%"
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)

:: Build frontend
echo [Step 2/3] Building frontend...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)
echo Compiling frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)

:: Start server
echo [Step 3/3] Starting server...
echo.
echo  Ready! Open your browser at:
echo  http://localhost:8000
echo.
echo  Press Ctrl+C to stop
echo.

cd /d "%BACKEND_DIR%"
python main.py
pause
