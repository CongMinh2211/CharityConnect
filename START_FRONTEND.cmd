@echo off
setlocal
cd /d "%~dp0frontend"
where npm >nul 2>nul
if errorlevel 1 (
  set "NODE_DIR=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.17.0-win-x64"
  if exist "%NODE_DIR%\npm.cmd" set "PATH=%NODE_DIR%;%PATH%"
)
if not exist node_modules (
  call npm install --no-audit --no-fund || goto :error
)
echo.
echo CharityConnect frontend: http://localhost:5173
echo Che do demo: API mo phong tren trinh duyet (khong can Docker)
echo Nhan Ctrl+C de dung.
set "VITE_USE_MOCK_API=true"
call npm run dev -- --host 0.0.0.0
exit /b %errorlevel%
:error
echo Khong the khoi dong frontend. Kiem tra Node.js va npm.
pause
exit /b 1
