@echo off
echo ========================================
echo   CLEAN REBUILD - BASKETBALL SCOREBOARD
echo ========================================
echo.
echo Step 1: Closing any running instances...
taskkill /F /IM "Basketball Scoreboard.exe" 2>nul
timeout /t 2 /nobreak > nul

echo Step 2: Cleaning old build...
if exist "dist" rmdir /s /q "dist"
echo Old build deleted.

echo.
echo Step 3: Building fresh package...
echo This will take 2-3 minutes. Please wait...
echo.

call npm run package:dir

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD COMPLETE!
echo ========================================
echo.
echo Starting application...
start "" "dist\win-unpacked\Basketball Scoreboard.exe"

echo.
echo App started! You can close this window.
echo.
pause
