@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop chua duoc cai hoac chua khoi dong.
  echo Cai Docker Desktop, mo Docker, sau do chay lai file nay.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
echo CharityConnect: http://localhost:5173
echo API Gateway:    http://localhost:8080
echo Grafana:        http://localhost:3000
docker compose up --build

