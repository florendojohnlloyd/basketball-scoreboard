@echo off
echo ========================================
echo   Starting Basketball Scoreboard
echo ========================================
echo.
echo Make sure Flask Relay Server is running first!
echo.
echo Starting application...
echo ========================================
echo.

cd /d "%~dp0"
start "" "dist\win-unpacked\Basketball Scoreboard.exe"

echo.
echo Application started!
echo You can close this window now.
echo.
pause
