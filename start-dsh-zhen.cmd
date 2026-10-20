@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.19.0 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node "%~dp0scripts\start-local.mjs" %*
set "DSH_ZHEN_EXIT=%errorlevel%"
if not "%DSH_ZHEN_EXIT%"=="0" pause
exit /b %DSH_ZHEN_EXIT%
