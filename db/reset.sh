#!/usr/bin/env bash
# ============================================================================
# AgentTrust: Complete Database Reset Script (Bash for Linux/WSL/macOS)
# 1. Drops all containers and volumes.
# 2. Recreates PostgreSQL & MongoDB containers from scratch.
# 3. Applies SQL schema, seed, functions, triggers, views, and composite indexes.
# 4. Builds MongoDB indexes, seeds polymorphic logs, and verifies consistency.
# ============================================================================

set -e

echo -e "\n================================================================================"
echo "AGENTTRUST: FULL DATABASE TEARDOWN & RE-INITIALIZATION"
echo -e "================================================================================\n"

echo ">>> [1/5] Stopping containers and destroying persistent volumes..."
docker compose down -v

echo -e "\n>>> [2/5] Starting containers with fresh PostgreSQL and MongoDB volumes..."
docker compose up -d

echo -e "\n>>> [3/5] Waiting for PostgreSQL and MongoDB to become healthy..."

echo ">>> Waiting for PostgreSQL on port 5433..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' agenttrust-postgres 2>/dev/null)" == '"healthy"' ]; do
    sleep 1
done
echo ">>> PostgreSQL is HEALTHY on port 5433."

echo ">>> Waiting for MongoDB on port 27017..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' agenttrust-mongo 2>/dev/null)" == '"healthy"' ]; do
    sleep 1
done
echo ">>> MongoDB is HEALTHY on port 27017."

echo -e "\n>>> [4/5] Applying MongoDB indexes & polymorphic interaction seed data..."
node db/mongo/indexes.mjs
node db/mongo/seed.mjs

echo -e "\n>>> [5/5] Running cross-database referential consistency verification..."
node db/mongo/verify-consistency.mjs

echo -e "\n================================================================================"
echo ">>> DATABASE RESET COMPLETE: 100% HEALTHY SEED BASELINE RESTORED"
echo -e "================================================================================\n"
docker compose ps
