@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
    echo Run npm ci and npm run build in this folder first.
    pause
    exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
    echo Run npm ci in this folder first.
    pause
    exit /b 1
)
call npm.cmd run preview -- --port 4173 --strictPort --open
if errorlevel 1 pause
