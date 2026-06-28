@echo off
setlocal
cd /d "%~dp0"
set "NODE_DIR=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.17.0-win-x64"
if exist "%NODE_DIR%\npm.cmd" set "PATH=%NODE_DIR%;%PATH%"
if not exist ".venv\Scripts\python.exe" (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -m venv .venv || goto :failed
  ) else (
    python -m venv .venv || goto :failed
  )
)
set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo Khong the tao moi truong Python tai %PY%.
  goto :failed
)

echo [1/5] Identity Service
pushd services\identity
call npm run lint || goto :failed
call npm test -- --runInBand --forceExit || goto :failed
popd

echo [2/5] Campaign Service
pushd services\campaign
call npm run lint || goto :failed
call npm test -- --runInBand --forceExit || goto :failed
popd

echo [3/5] Donation Service
"%PY%" -m pip install --disable-pip-version-check -q -r services\donation\requirements.txt
pushd services\donation
"%PY%" -m pytest || goto :failed
popd

echo [4/5] Assistant Service
"%PY%" -m pip install --disable-pip-version-check -q -r services\assistant\requirements.txt
pushd services\assistant
"%PY%" -m pytest || goto :failed
popd

echo [5/5] Frontend test va production build
pushd web
call npm run lint || goto :failed
call npm test -- --pool=forks --poolOptions.forks.singleFork=true || goto :failed
call npm run build || goto :failed
popd
echo Tat ca kiem thu da thanh cong.
exit /b 0

:failed
popd 2>nul
echo Kiem thu that bai.
exit /b 1
