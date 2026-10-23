#!/usr/bin/env bash
# ============================================================================
# AgentTrust: Database Reset Script (Bash for Linux/WSL/macOS)
# Drops all containers and volumes, then restarts and re-seeds from scratch.
# ============================================================================

set -e

echo ">>> Stopping AgentTrust database containers and destroying persistent volumes..."
docker compose down -v

echo ">>> Starting containers with fresh PostgreSQL and MongoDB volumes..."
docker compose up -d

echo ">>> Waiting for PostgreSQL to be healthy on port 5433..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' agenttrust-postgres 2>/dev/null)" == '"healthy"' ]; do
    sleep 1
done

echo ">>> Database successfully initialized and seeded!"
docker compose ps
