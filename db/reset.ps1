# ============================================================================
# AgentTrust: Database Reset Script (PowerShell for Windows)
# Drops all containers and volumes, then restarts and re-seeds from scratch.
# ============================================================================

Write-Host ">>> Stopping AgentTrust database containers and destroying persistent volumes..." -ForegroundColor Yellow
docker compose down -v

Write-Host ">>> Starting containers with fresh PostgreSQL and MongoDB volumes..." -ForegroundColor Yellow
docker compose up -d

Write-Host ">>> Waiting for PostgreSQL to be healthy on port 5433..." -ForegroundColor Cyan
$retries = 20
$healthy = $false
while ($retries -gt 0) {
    $status = docker inspect --format='{{json .State.Health.Status}}' agenttrust-postgres 2>$null
    if ($status -eq '"healthy"') {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 1
    $retries--
}

if ($healthy) {
    Write-Host ">>> Database successfully initialized and seeded!" -ForegroundColor Green
    docker compose ps
} else {
    Write-Host ">>> Warning: Database container did not reach healthy state in time." -ForegroundColor Red
}
