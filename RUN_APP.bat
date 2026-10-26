@echo off
echo ========================================
echo   Starting Basketball Scoreboard
echo ========================================
echo.

cd /d "%~dp0"

:: Close any existing instances
taskkill /F /IM "electron.exe" 2>nul

:: Build renderer and main to ensure latest code is running
echo Compiling latest scoreboard updates...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed! Check errors above.
    pause
    exit /b %ERRORLEVEL%
)

:: Run using electron from fresh build
echo.
echo Starting app...
call npx electron out\main\index.js

echo.
echo App closed.
pause
