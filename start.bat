@echo off
:: Anchor OS - Unified Launcher
:: Launches the Anchor Engine which manages all other services

TITLE Anchor OS - Unified Launcher

echo ========================================================
echo   Anchor OS - Unified Launcher
echo   Launching Anchor Engine (Management Hub)
echo ========================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js v18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Check for PNPM
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] PNPM is not installed. Installing via NPM...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install PNPM.
        pause
        exit /b 1
    )
    echo [OK] PNPM installed successfully.
)

:: Install dependencies at root
echo [INFO] Installing dependencies...
call pnpm install
if %errorlevel% neq 0 (
    echo [ERROR] Root dependencies installation failed.
    pause
    exit /b 1
)

echo [INFO] Starting Anchor Engine...
echo [INFO] Other services will be started automatically by the engine.
echo [INFO] Logs from all services will be displayed here.
echo.

cd /d "C:\Users\rsbiiw\Projects\anchor-os\packages\anchor-engine"
:: Run engine directly in this window to capture all logs
node --expose-gc engine\dist\index.js

echo.
echo [INFO] Anchor Engine has stopped.
pause
