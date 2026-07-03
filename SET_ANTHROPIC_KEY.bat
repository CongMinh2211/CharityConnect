@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SET_ANTHROPIC_KEY.ps1"
if errorlevel 1 (
  echo.
  echo Khong the luu Anthropic API key.
)
pause
