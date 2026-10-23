-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Database Indexes Definition (Performance & Query Optimization)
-- Target DBMS: PostgreSQL 16+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FOREIGN KEY INDEXES
-- PostgreSQL does not automatically create indexes on foreign key columns.
-- Without these, table joins and cascade deletes incur full table scans.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_interactions_source_agent_id 
    ON interactions (source_agent_id);

CREATE INDEX IF NOT EXISTS idx_interactions_target_agent_id 
    ON interactions (target_agent_id);

CREATE INDEX IF NOT EXISTS idx_violations_interaction_id 
    ON violations (interaction_id);

CREATE INDEX IF NOT EXISTS idx_violations_policy_id 
    ON violations (policy_id);

CREATE INDEX IF NOT EXISTS idx_quarantine_events_agent_id 
    ON quarantine_events (agent_id);

CREATE INDEX IF NOT EXISTS idx_quarantine_events_violation_id 
    ON quarantine_events (violation_id);

CREATE INDEX IF NOT EXISTS idx_risk_scores_agent_id 
    ON risk_scores (agent_id);

-- ----------------------------------------------------------------------------
-- 2. TEMPORAL & FILTERING INDEXES (B-Tree)
-- Speeds up time-series range queries, dashboard feeds, and severity filtering
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_interactions_initiated_at_desc 
    ON interactions (initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_violations_detected_at_desc 
    ON violations (detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_violations_severity 
    ON violations (severity);

-- ----------------------------------------------------------------------------
-- 3. COMPOSITE INDEX
-- Optimizes queries filtering interactions by specific agent ordered by time
-- (common query in risk score recalculation and agent timeline views)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_interactions_source_time 
    ON interactions (source_agent_id, initiated_at DESC);
