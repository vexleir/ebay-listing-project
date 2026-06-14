@echo off
setlocal
REM ============================================================
REM  start-servers.bat - bring up the full eBay app stack
REM
REM  Starts Docker Desktop (if needed), then runs
REM  `docker compose up -d` in /home/vexleir/ebay-app (WSL Ubuntu).
REM  Caddy is always force-recreated because its Caddyfile bind
REM  mount can break after a reboot (see docker-compose.yml).
REM  Finally checks the cloudflared Windows service, which serves
REM  https://app.anmcollectibles.com via a Cloudflare Tunnel.
REM ============================================================

set "PROJECT_DIR=/home/vexleir/ebay-app"
set "DOCKER_DESKTOP=C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo [1/5] Checking Docker engine...
wsl -d Ubuntu -- docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo       Docker engine not running - starting Docker Desktop...
start "" "%DOCKER_DESKTOP%"

set /a TRIES=0
:wait_docker
timeout /t 2 /nobreak >nul
wsl -d Ubuntu -- docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a TRIES+=1
if %TRIES% lss 60 goto wait_docker
echo ERROR: Docker engine did not become ready within 2 minutes.
echo        Open Docker Desktop manually, wait for it to finish starting,
echo        then run this script again.
pause
exit /b 1

:docker_ready
echo       Docker is running.

echo [2/5] Starting MongoDB and app containers...
wsl -d Ubuntu --cd %PROJECT_DIR% -- docker compose up -d mongodb app
if errorlevel 1 (
    echo ERROR: docker compose failed. See output above.
    pause
    exit /b 1
)

echo [3/5] Recreating Caddy (avoids stale Caddyfile mount after reboot)...
wsl -d Ubuntu --cd %PROJECT_DIR% -- docker compose up -d --force-recreate caddy
if errorlevel 1 (
    echo ERROR: Caddy failed to start. See output above.
    pause
    exit /b 1
)

echo [4/5] Checking Cloudflare Tunnel service (app.anmcollectibles.com)...
sc query cloudflared | find "RUNNING" >nul 2>&1
if not errorlevel 1 (
    echo       cloudflared service is running.
    goto tunnel_done
)
echo       cloudflared service is not running - trying to start it...
net start cloudflared >nul 2>&1
if not errorlevel 1 (
    echo       cloudflared service started.
    goto tunnel_done
)
echo WARNING: Could not start the cloudflared service (needs admin rights).
echo          Run this in an elevated terminal:  net start cloudflared
echo          Until then, https://app.anmcollectibles.com will show error 1033.

:tunnel_done
echo [5/5] Waiting for the app to respond on http://localhost:3001 ...
set /a TRIES=0
:wait_app
curl -s -o nul http://localhost:3001/ >nul 2>&1
if not errorlevel 1 goto app_ready
set /a TRIES+=1
if %TRIES% geq 15 (
    echo WARNING: App is not responding yet. Check logs with:
    echo          wsl -d Ubuntu --cd %PROJECT_DIR% -- docker compose logs app
    goto show_status
)
timeout /t 2 /nobreak >nul
goto wait_app

:app_ready
echo       App is up.

:show_status
echo.
echo ============================================================
wsl -d Ubuntu --cd %PROJECT_DIR% -- docker compose ps
echo ============================================================
echo  Local:  http://localhost:3001
echo  Public: https://app.anmcollectibles.com  (Cloudflare Tunnel)
echo          https://anmcollectibles.com      (Caddy)
echo ============================================================
echo.
pause
