@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CharityConnect - Install and Run

echo ============================================================
echo   CHARITYCONNECT - CAI MOI TRUONG VA CHAY DEMO
echo   Web mock + Python Assistant, khong can Docker/API key
echo ============================================================
echo.

call :find_node
if errorlevel 1 exit /b 1
call :find_python
if errorlevel 1 exit /b 1

echo [1/4] Cai thu vien frontend...
pushd web
call npm install --no-audit --no-fund
if errorlevel 1 goto :failed
popd

echo [2/4] Tao Python virtual environment...
if not exist ".venv\Scripts\python.exe" %PYTHON_CMD% -m venv .venv
if errorlevel 1 goto :failed
set "BOT_PYTHON=%CD%\.venv\Scripts\python.exe"

echo [3/4] Cai thu vien cho tro ly Python...
"%BOT_PYTHON%" -m pip install --disable-pip-version-check -q -r services\assistant\requirements.txt
if errorlevel 1 goto :failed

echo [4/4] Khoi dong tro ly va website...
if not exist logs mkdir logs
powershell -NoProfile -Command "$port = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue; if (-not $port) { Start-Process -FilePath '%BOT_PYTHON%' -ArgumentList '-m','uvicorn','app.main:app','--app-dir','services/assistant','--host','127.0.0.1','--port','8001' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%CD%\logs\assistant.log' -RedirectStandardError '%CD%\logs\assistant-error.log' }"

set "VITE_USE_MOCK_API=true"
echo.
echo Website:       http://127.0.0.1:5173
echo Python bot:    http://127.0.0.1:8001/health
echo API docs bot:  http://127.0.0.1:8001/docs
echo Tai khoan: donor@demo.vn / org@demo.vn / admin@demo.vn
echo Mat khau: Demo@123
echo Nhan Ctrl+C de dung web.
echo.
pushd web
call npm run dev -- --host 0.0.0.0
popd
exit /b %errorlevel%

:find_node
where npm >nul 2>nul
if not errorlevel 1 exit /b 0
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*") do for /d %%V in ("%%~fD\node-*-win-x64") do if exist "%%~fV\npm.cmd" set "PATH=%%~fV;%PATH%"
where npm >nul 2>nul
if not errorlevel 1 exit /b 0
where winget >nul 2>nul || goto :node_missing
echo Dang cai Node.js LTS bang winget...
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
echo Node.js vua duoc cai. Dong cua so nay, mo lai va chay INSTALL_AND_RUN.bat.
pause
exit /b 1
:node_missing
echo Khong tim thay Node.js/npm va winget. Cai Node.js LTS roi chay lai.
pause
exit /b 1

:find_python
where py >nul 2>nul
if not errorlevel 1 (set "PYTHON_CMD=py -3" & exit /b 0)
where python >nul 2>nul
if not errorlevel 1 (set "PYTHON_CMD=python" & exit /b 0)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (set "PYTHON_CMD=\"%LOCALAPPDATA%\Programs\Python\Python312\python.exe\"" & exit /b 0)
where winget >nul 2>nul || goto :python_missing
echo Dang cai Python 3.12 bang winget...
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
echo Python vua duoc cai. Dong cua so nay, mo lai va chay INSTALL_AND_RUN.bat.
pause
exit /b 1
:python_missing
echo Khong tim thay Python va winget. Cai Python 3.12 roi chay lai.
pause
exit /b 1

:failed
popd 2>nul
echo.
echo Cai dat hoac khoi dong that bai. Xem thong bao phia tren.
pause
exit /b 1
