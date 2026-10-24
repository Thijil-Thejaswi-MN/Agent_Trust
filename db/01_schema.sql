-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Database Schema Definition (DDL)
-- Target DBMS: PostgreSQL 16+
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables if re-initializing (in reverse dependency order)
DROP TABLE IF EXISTS risk_scores CASCADE;
DROP TABLE IF EXISTS quarantine_events CASCADE;
DROP TABLE IF EXISTS violations CASCADE;
DROP TABLE IF EXISTS interactions CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores platform operators with role-based access control (admin vs auditor)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'auditor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. AGENTS TABLE
-- Registry of autonomous AI agents interacting within the ecosystem
-- ----------------------------------------------------------------------------
CREATE TABLE agents (
    agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    owner_team VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'offline')),
    cert_fingerprint VARCHAR(128) UNIQUE NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. POLICIES TABLE
-- Governance rules defining SLA, security, and behavioral thresholds
-- ----------------------------------------------------------------------------
CREATE TABLE policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    name VARCHAR(100) UNIQUE NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    threshold NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. INTERACTIONS TABLE
-- Records pairwise agent-to-agent (A2A) calls with telemetry latencies
-- Constraint: source agent cannot communicate with itself (self-interaction check)
-- ----------------------------------------------------------------------------
CREATE TABLE interactions (
    interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    target_agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    protocol VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    latency_d2d NUMERIC(10, 2),    -- Device-to-device latency in ms
    latency_d2b NUMERIC(10, 2),    -- Device-to-broker latency in ms
    latency_d2rev NUMERIC(10, 2),  -- Device-to-reviewer latency in ms
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT check_no_self_interaction CHECK (source_agent_id <> target_agent_id),
    CONSTRAINT check_latency_non_negative CHECK (
        (latency_d2d IS NULL OR latency_d2d >= 0.0) AND
        (latency_d2b IS NULL OR latency_d2b >= 0.0) AND
        (latency_d2rev IS NULL OR latency_d2rev >= 0.0)
    )
);

-- ----------------------------------------------------------------------------
-- 5. VIOLATIONS TABLE
-- Flags governance breaches detected across interactions
-- ----------------------------------------------------------------------------
CREATE TABLE violations (
    violation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL REFERENCES interactions(interaction_id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES policies(policy_id) ON DELETE RESTRICT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. QUARANTINE_EVENTS TABLE
-- Audit log of containment actions isolating compromised or offending agents
-- Partial UNIQUE Index guarantees an agent can only have ONE active quarantine at a time
-- ----------------------------------------------------------------------------
CREATE TABLE quarantine_events (
    quarantine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    violation_id UUID REFERENCES violations(violation_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ
);

-- Partial unique index enforcing at most ONE active quarantine per agent
CREATE UNIQUE INDEX idx_single_active_quarantine_per_agent 
    ON quarantine_events (agent_id) 
    WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 7. RISK_SCORES TABLE
-- Computed governance risk posture score (0.00 to 100.00) per agent
-- ----------------------------------------------------------------------------
CREATE TABLE risk_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    score_value NUMERIC(5, 2) NOT NULL CHECK (score_value >= 0.0 AND score_value <= 100.0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
