@echo off
title EcoReward Smart Bin Server
cd /d "%~dp0"

echo ========================================================
echo             EcoReward Smart Bin System
echo ========================================================
echo.
echo Starting local Python backend...
echo.

:: Detect Python executable (.venv preferred if available)
if exist ".venv\Scripts\python.exe" (
    set "PY_CMD=.venv\Scripts\python.exe"
) else (
    set "PY_CMD=python"
)

:: Verify Python is available
%PY_CMD% --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found!
    echo Please install Python from https://www.python.org/
    echo.
    pause
    exit /b 1
)

:: Display detected local Wi-Fi IP addresses for ESP32 reference
echo Your Laptop's local network IP addresses:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    echo   -%%a
)
echo.

:: Open browser directly to deposit page
echo Opening EcoReward in your default browser...
start http://127.0.0.1:5000/deposit

echo.
echo ========================================================
echo Server is RUNNING!
echo   - Local Dashboard : http://127.0.0.1:5000
echo   - Leave this window OPEN while using EcoReward.
echo   - Press Ctrl+C or close this window to stop the server.
echo ========================================================
echo.

%PY_CMD% app.py

if %errorlevel% neq 0 (
    echo.
    echo Server stopped with an error code: %errorlevel%
    pause
)

