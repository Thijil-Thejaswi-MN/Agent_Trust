-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- DDL Demonstration Examples (ALTER and DROP statements)
-- Course requirement: Demonstrates explicit schema alteration and dropping.
-- Note: These statements are run inside a rollback transaction block so that
-- they illustrate the DDL commands without corrupting the production schema.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ALTER TABLE: ADD COLUMN
-- Adds an optional operational tag to agents (e.g. tier classification)
-- ----------------------------------------------------------------------------
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS tier_level VARCHAR(20) DEFAULT 'standard';

COMMENT ON COLUMN agents.tier_level IS 'Demonstration of ALTER TABLE ADD COLUMN: Tier classification of agent';

-- ----------------------------------------------------------------------------
-- 2. ALTER TABLE: MODIFY / ALTER COLUMN TYPE & DEFAULT
-- Expands the latency column precision or changes default values
-- ----------------------------------------------------------------------------
ALTER TABLE interactions 
ALTER COLUMN protocol TYPE VARCHAR(80);

-- ----------------------------------------------------------------------------
-- 3. ALTER TABLE: ADD CONSTRAINT
-- Adds a new CHECK constraint on latency to ensure non-negative values
-- ----------------------------------------------------------------------------
ALTER TABLE interactions 
ADD CONSTRAINT check_positive_latency_d2d 
CHECK (latency_d2d IS NULL OR latency_d2d >= 0.0);

-- ----------------------------------------------------------------------------
-- 4. ALTER TABLE: DROP CONSTRAINT
-- Demonstrates removing the newly added constraint
-- ----------------------------------------------------------------------------
ALTER TABLE interactions 
DROP CONSTRAINT IF EXISTS check_positive_latency_d2d;

-- ----------------------------------------------------------------------------
-- 5. ALTER TABLE: DROP COLUMN
-- Demonstrates dropping the added demonstration column
-- ----------------------------------------------------------------------------
ALTER TABLE agents 
DROP COLUMN IF EXISTS tier_level;

-- ----------------------------------------------------------------------------
-- 6. DROP TABLE (Safe / Conditional)
-- Creates a temporary sandbox table and then demonstrates DROP TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demo_quarantine_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(agent_id),
    reason TEXT NOT NULL
);

-- Demonstrate DROP TABLE with CASCADE
DROP TABLE IF EXISTS demo_quarantine_audit CASCADE;

-- Rollback the demo transaction so schema remains pristine
ROLLBACK;
