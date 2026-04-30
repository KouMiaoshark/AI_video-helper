@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title TapNow Clone - First Run

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "BACKEND_DIR=%SCRIPT_DIR%\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%\frontend"
set "VENV_DIR=%SCRIPT_DIR%\.venv"
set "FRONTEND_DIST_DIR=%FRONTEND_DIR%\dist"
set "PYTHON_CMD="
set "PYTHON_LABEL="
set "NODE_EXE="
set "NODE_LABEL="
set "NPM_CMD="

if not exist "%BACKEND_DIR%" (
    echo [ERROR] Missing "%BACKEND_DIR%".
    echo Put this batch file in the project root, then run it again.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo [ERROR] Missing "%FRONTEND_DIR%".
    echo Put this batch file in the project root, then run it again.
    pause
    exit /b 1
)

echo.
echo ==============================================
echo   TapNow Clone - First Run Bootstrap
echo ==============================================
echo.

call :refresh_path
call :ensure_python || goto fail
call :ensure_node || goto fail

echo [1/4] Preparing Python virtual environment...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    call %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create .venv.
        goto fail
    )
) else (
    echo Existing .venv found, skipping creation.
)

echo [2/4] Installing backend dependencies...
call "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
    echo [ERROR] Failed to upgrade pip.
    goto fail
)

call "%VENV_DIR%\Scripts\python.exe" -m pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    goto fail
)

echo [3/4] Installing frontend dependencies...
pushd "%FRONTEND_DIR%"
if exist "package-lock.json" (
    call %NPM_CMD% ci
) else (
    call %NPM_CMD% install
)
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install frontend dependencies.
    goto fail
)

echo [4/4] Building frontend...
call %NPM_CMD% run build
if errorlevel 1 (
    popd
    echo [ERROR] Frontend build failed.
    goto fail
)
popd

echo.
echo ==============================================
echo   Bootstrap Complete
echo ==============================================
echo Python: %PYTHON_LABEL%
echo Node.js: %NODE_LABEL%
echo Virtual env: %VENV_DIR%
echo Frontend build: %FRONTEND_DIST_DIR%
echo.
echo Next time, just double-click start.bat
echo.
choice /C YN /N /M "Start the project now? [Y/N]: "
if errorlevel 2 goto success

call "%SCRIPT_DIR%\start.bat"
exit /b %errorlevel%

:success
echo.
echo You can start later by double-clicking start.bat
pause
exit /b 0

:fail
echo.
echo Bootstrap did not finish.
echo Common reasons:
echo 1. winget is not available on this PC
echo 2. The installer prompt was canceled
echo 3. Network or permission issues blocked the download
echo.
echo Manual installers:
echo - Python 3.11: https://www.python.org/downloads/windows/
echo - Node.js LTS: https://nodejs.org/
echo.
pause
exit /b 1

:ensure_python
call :detect_python
if defined PYTHON_CMD (
    echo Python found: %PYTHON_LABEL%
    exit /b 0
)

echo Python 3.10+ was not found. Installing Python 3.11 with winget...
where winget >nul 2>nul
if errorlevel 1 (
    echo [ERROR] winget is not available, cannot auto-install Python.
    exit /b 1
)

winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo [ERROR] Python auto-install failed.
    exit /b 1
)

call :refresh_path
call :detect_python
if not defined PYTHON_CMD (
    echo [ERROR] Python was installed, but this window still cannot find it.
    echo Close this window and run the batch file again.
    exit /b 1
)

echo Python installed: %PYTHON_LABEL%
exit /b 0

:detect_python
set "PYTHON_CMD="
set "PYTHON_LABEL="

where py >nul 2>nul
if not errorlevel 1 (
    py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD=py -3"
        for /f "delims=" %%i in ('py -3 --version 2^>^&1') do set "PYTHON_LABEL=%%i"
        exit /b 0
    )
)

where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD=python"
        for /f "delims=" %%i in ('python --version 2^>^&1') do set "PYTHON_LABEL=%%i"
        exit /b 0
    )
)

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD="%LocalAppData%\Programs\Python\Python311\python.exe""
        for /f "delims=" %%i in ('"%LocalAppData%\Programs\Python\Python311\python.exe" --version 2^>^&1') do set "PYTHON_LABEL=%%i"
        exit /b 0
    )
)

if exist "%ProgramFiles%\Python311\python.exe" (
    "%ProgramFiles%\Python311\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD="%ProgramFiles%\Python311\python.exe""
        for /f "delims=" %%i in ('"%ProgramFiles%\Python311\python.exe" --version 2^>^&1') do set "PYTHON_LABEL=%%i"
        exit /b 0
    )
)

exit /b 1

:ensure_node
call :detect_node
if defined NODE_EXE (
    echo Node.js found: %NODE_LABEL%
    exit /b 0
)

echo Node.js 18+ was not found. Installing Node.js LTS with winget...
where winget >nul 2>nul
if errorlevel 1 (
    echo [ERROR] winget is not available, cannot auto-install Node.js.
    exit /b 1
)

winget install -e --id OpenJS.NodeJS.LTS --scope user --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo [ERROR] Node.js auto-install failed.
    exit /b 1
)

call :refresh_path
call :detect_node
if not defined NODE_EXE (
    echo [ERROR] Node.js was installed, but this window still cannot find node or npm.
    echo Close this window and run the batch file again.
    exit /b 1
)

echo Node.js installed: %NODE_LABEL%
exit /b 0

:detect_node
set "NODE_EXE="
set "NODE_LABEL="
set "NPM_CMD="

where node >nul 2>nul
if not errorlevel 1 (
    node -e "const major = Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)" >nul 2>nul
    if not errorlevel 1 (
        where npm >nul 2>nul
        if not errorlevel 1 (
            set "NODE_EXE=node"
            set "NPM_CMD=npm"
            for /f "delims=" %%i in ('node --version 2^>^&1') do set "NODE_LABEL=%%i"
            exit /b 0
        )
    )
)

if exist "%ProgramFiles%\nodejs\node.exe" if exist "%ProgramFiles%\nodejs\npm.cmd" (
    "%ProgramFiles%\nodejs\node.exe" -e "const major = Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)" >nul 2>nul
    if not errorlevel 1 (
        set "NODE_EXE="%ProgramFiles%\nodejs\node.exe""
        set "NPM_CMD="%ProgramFiles%\nodejs\npm.cmd""
        for /f "delims=" %%i in ('"%ProgramFiles%\nodejs\node.exe" --version 2^>^&1') do set "NODE_LABEL=%%i"
        exit /b 0
    )
)

if exist "%LocalAppData%\Programs\nodejs\node.exe" if exist "%LocalAppData%\Programs\nodejs\npm.cmd" (
    "%LocalAppData%\Programs\nodejs\node.exe" -e "const major = Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)" >nul 2>nul
    if not errorlevel 1 (
        set "NODE_EXE="%LocalAppData%\Programs\nodejs\node.exe""
        set "NPM_CMD="%LocalAppData%\Programs\nodejs\npm.cmd""
        for /f "delims=" %%i in ('"%LocalAppData%\Programs\nodejs\node.exe" --version 2^>^&1') do set "NODE_LABEL=%%i"
        exit /b 0
    )
)

exit /b 1

:refresh_path
set "MACHINE_PATH="
set "USER_PATH="
for /f "tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find /i "Path"') do set "MACHINE_PATH=%%b"
for /f "tokens=2,*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul ^| find /i "Path"') do set "USER_PATH=%%b"
if defined MACHINE_PATH set "PATH=%PATH%;!MACHINE_PATH!"
if defined USER_PATH set "PATH=%PATH%;!USER_PATH!"
exit /b 0
