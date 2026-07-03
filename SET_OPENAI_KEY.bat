@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SET_OPENAI_KEY.ps1"
if errorlevel 1 (
  echo.
  echo Khong the luu API key.
)
pause
