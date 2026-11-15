@echo off
where node >nul 2>nul
if %errorlevel%==0 (
  npm start
  exit /b
)
if exist "%~dp0.runtime\node-v22.14.0-win-x64\npm.cmd" (
  set "PATH=%~dp0.runtime\node-v22.14.0-win-x64;%PATH%"
  npm start
  exit /b
)
echo Node.js is required. Install Node.js 22 and run npm install, then npm start.
exit /b 1
