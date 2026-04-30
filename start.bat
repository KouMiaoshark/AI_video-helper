@echo off
chcp 65001 >nul
setlocal EnableExtensions
title TapNow Clone

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"
set "VENV_PYTHON=%PROJECT_DIR%\.venv\Scripts\python.exe"
set "DIST_INDEX=%FRONTEND_DIR%\dist\index.html"
set "PYTHON_CMD="

echo.
echo ==================================
echo   TapNow Clone - Start Script
echo ==================================
echo.

if exist "%VENV_PYTHON%" (
    set "PYTHON_CMD=%VENV_PYTHON%"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No project virtual env and no system Python found.
        echo Run the first-run batch file before starting the project.
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

call %PYTHON_CMD% -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Backend dependencies are missing in the current Python environment.
    echo Run the first-run batch file before starting the project.
    pause
    exit /b 1
)

if not exist "%DIST_INDEX%" (
    echo Frontend build not found. Building once now...
    where npm >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Frontend is not built and npm was not found.
        echo Run the first-run batch file before starting the project.
        pause
        exit /b 1
    )

    pushd "%FRONTEND_DIR%"
    if not exist "node_modules" (
        call npm install
        if errorlevel 1 (
            popd
            echo [ERROR] Frontend dependency install failed.
            pause
            exit /b 1
        )
    )

    call npm run build
    if errorlevel 1 (
        popd
        echo [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
    popd
)

echo Starting...
echo Frontend: http://localhost:8000
echo API docs: http://localhost:8000/docs
echo Press Ctrl+C to stop
echo.

cd /d "%BACKEND_DIR%"
call %PYTHON_CMD% main.py
pause
