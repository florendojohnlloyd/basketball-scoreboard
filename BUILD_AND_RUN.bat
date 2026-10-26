@echo off
echo ========================================
echo   BUILDING BASKETBALL SCOREBOARD
echo ========================================
echo.
echo This will take 2-3 minutes...
echo Please wait...
echo.

cd /d "%~dp0"

:: Build the app
call npm run package:dir

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD SUCCESSFUL!
echo ========================================
echo.
echo Starting application...
echo.

:: Run the app
start "" "dist\win-unpacked\Basketball Scoreboard.exe"

echo.
echo Application started!
echo You can close this window now.
echo.
pause
