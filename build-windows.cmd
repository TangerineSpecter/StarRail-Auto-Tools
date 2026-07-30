@echo off
setlocal

REM Double-click this file on Windows to choose a package format.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
set "exit_code=%ERRORLEVEL%"

echo.
if not "%exit_code%"=="0" (
    echo Packaging failed. See the message above.
) else (
    echo Packaging completed.
)
pause
exit /b %exit_code%
