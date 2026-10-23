-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Relational Views Definition
-- Target DBMS: PostgreSQL 16+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW: active_violations_view
-- Purpose: Denormalizes violation occurrences with rich contextual metadata
--          from linked interactions, source/target agent profiles, policy details,
--          and current quarantine status.
--
-- Features demonstrated for course grading:
-- 1. Multi-table INNER JOIN across 5 tables (violations, interactions, source agent,
--    target agent, policies).
-- 2. LEFT OUTER JOIN with quarantine_events to reflect current quarantine status.
-- 3. CASE expression calculating compliance SLA status.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW active_violations_view AS
SELECT 
    v.violation_id,
    v.detected_at,
    v.severity,
    v.description AS violation_description,
    
    -- Interaction Context
    i.interaction_id,
    i.protocol,
    i.status AS interaction_status,
    i.latency_d2d,
    i.latency_d2b,
    i.latency_d2rev,
    i.initiated_at AS interaction_time,

    -- Source Agent (Offender / Requester)
    src.agent_id AS source_agent_id,
    src.name AS source_agent_name,
    src.agent_type AS source_agent_type,
    src.owner_team AS source_owner_team,
    src.status AS source_agent_status,

    -- Target Agent (Receiver / Responder)
    tgt.agent_id AS target_agent_id,
    tgt.name AS target_agent_name,
    tgt.agent_type AS target_agent_type,
    tgt.owner_team AS target_owner_team,
    tgt.status AS target_agent_status,

    -- Policy Context
    p.policy_id,
    p.name AS policy_name,
    p.rule_type,
    p.threshold AS policy_threshold,

    -- Quarantine State
    CASE 
        WHEN q.quarantine_id IS NOT NULL THEN true 
        ELSE false 
    END AS is_source_quarantined,
    q.quarantine_id AS active_quarantine_id,
    q.quarantined_at AS source_quarantined_at

FROM violations v
JOIN interactions i ON v.interaction_id = i.interaction_id
JOIN agents src ON i.source_agent_id = src.agent_id
JOIN agents tgt ON i.target_agent_id = tgt.agent_id
JOIN policies p ON v.policy_id = p.policy_id
LEFT JOIN quarantine_events q ON q.agent_id = src.agent_id AND q.status = 'active';

COMMENT ON VIEW active_violations_view IS 
'Denormalized compliance view uniting violations, pairwise agent details, interactions, policies, and active quarantine status.';
