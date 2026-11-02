# ============================================================================
# AgentTrust: Complete Database Reset Script (PowerShell for Windows)
# 1. Drops all containers and volumes.
# 2. Recreates PostgreSQL & MongoDB containers from scratch.
# 3. Applies SQL schema, seed, functions, triggers, views, composite indexes, CTEs (07), and RBAC roles (08).
# 4. Builds MongoDB indexes, seeds polymorphic logs, and verifies consistency.
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "AGENTTRUST: FULL DATABASE TEARDOWN & RE-INITIALIZATION" -ForegroundColor Cyan
Write-Host "================================================================================`n" -ForegroundColor Cyan

Write-Host ">>> [1/5] Stopping containers and destroying persistent volumes..." -ForegroundColor Yellow
docker compose down -v

Write-Host "`n>>> [2/5] Starting containers with fresh PostgreSQL and MongoDB volumes..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`n>>> [3/5] Waiting for PostgreSQL and MongoDB to become healthy..." -ForegroundColor Cyan

# Wait for PostgreSQL
$retries = 30
$pgHealthy = $false
while ($retries -gt 0) {
    $status = docker inspect --format='{{json .State.Health.Status}}' agenttrust-postgres 2>$null
    if ($status -eq '"healthy"') {
        $pgHealthy = $true
        break
    }
    Start-Sleep -Seconds 1
    $retries--
}

if (-not $pgHealthy) {
    Write-Host ">>> Error: PostgreSQL failed to become healthy in time." -ForegroundColor Red
    exit 1
}
Write-Host ">>> PostgreSQL is HEALTHY on port 5433." -ForegroundColor Green

# Wait for MongoDB
$retries = 30
$mongoHealthy = $false
while ($retries -gt 0) {
    $status = docker inspect --format='{{json .State.Health.Status}}' agenttrust-mongo 2>$null
    if ($status -eq '"healthy"') {
        $mongoHealthy = $true
        break
    }
    Start-Sleep -Seconds 1
    $retries--
}

if (-not $mongoHealthy) {
    Write-Host ">>> Error: MongoDB failed to become healthy in time." -ForegroundColor Red
    exit 1
}
Write-Host ">>> MongoDB is HEALTHY on port 27017." -ForegroundColor Green

Write-Host "`n>>> [4/5] Applying MongoDB indexes & polymorphic interaction seed data..." -ForegroundColor Yellow
node db/mongo/indexes.mjs
node db/mongo/seed.mjs

Write-Host "`n>>> [5/5] Running cross-database referential consistency verification..." -ForegroundColor Yellow
node db/mongo/verify-consistency.mjs

Write-Host "`n================================================================================" -ForegroundColor Green
Write-Host ">>> DATABASE RESET COMPLETE: 100% HEALTHY SEED BASELINE RESTORED" -ForegroundColor Green
Write-Host "================================================================================`n" -ForegroundColor Green
docker compose ps
