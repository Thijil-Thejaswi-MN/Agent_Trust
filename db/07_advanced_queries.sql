-- ============================================================================
-- AgentTrust: Advanced SQL Analytics (CTE & Recursive CTE)
-- Target DBMS: PostgreSQL 16+
--
-- STANDALONE INITIALIZATION SCRIPT:
-- This script contains runnable demo queries evaluated during container bootstrap.
-- The application API (app/api/agents/blast-radius/route.ts) executes the
-- parameterized equivalent ($1 = agent_id UUID, $2 = max_depth INT).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECURSIVE CTE: Downstream Agent Blast Radius Analysis
-- Starting from 'Alpha-SecOps-01', recursively traverses pairwise interactions
-- (source -> target) to compute all downstream reachable agents within 3 hops.
-- ----------------------------------------------------------------------------
WITH RECURSIVE blast_radius AS (
    -- Anchor Member: Direct outbound interactions from Alpha-SecOps-01 (Depth 1)
    SELECT 
        i.target_agent_id AS agent_id,
        tgt.name AS agent_name,
        tgt.agent_type,
        tgt.owner_team,
        tgt.status,
        1 AS depth,
        ARRAY[i.source_agent_id, i.target_agent_id]::UUID[] AS path_ids,
        ARRAY[src.name, tgt.name]::VARCHAR[] AS path_names,
        i.protocol AS via_protocol,
        i.initiated_at AS interaction_time
    FROM interactions i
    JOIN agents src ON i.source_agent_id = src.agent_id
    JOIN agents tgt ON i.target_agent_id = tgt.agent_id
    WHERE i.source_agent_id = 'b0000000-0000-0000-0000-000000000001'::UUID -- Alpha-SecOps-01

    UNION

    -- Recursive Member: Follow outbound interactions from reached agents
    SELECT 
        i.target_agent_id AS agent_id,
        tgt.name AS agent_name,
        tgt.agent_type,
        tgt.owner_team,
        tgt.status,
        br.depth + 1 AS depth,
        br.path_ids || i.target_agent_id AS path_ids,
        br.path_names || tgt.name AS path_names,
        i.protocol AS via_protocol,
        i.initiated_at AS interaction_time
    FROM interactions i
    JOIN blast_radius br ON i.source_agent_id = br.agent_id
    JOIN agents tgt ON i.target_agent_id = tgt.agent_id
    WHERE NOT (i.target_agent_id = ANY(br.path_ids)) -- Cycle guard
      AND br.depth < 3 -- Depth limit: 3 hops
)
SELECT DISTINCT ON (agent_id)
    agent_id,
    agent_name,
    agent_type,
    owner_team,
    status,
    depth,
    path_names,
    via_protocol,
    interaction_time
FROM blast_radius
ORDER BY agent_id, depth ASC;

-- ----------------------------------------------------------------------------
-- 2. NON-RECURSIVE CTE: Per-Owner-Team Governance Violation Summary
-- Computes aggregated violation metrics grouped by engineering team.
-- ----------------------------------------------------------------------------
WITH team_violations AS (
    SELECT 
        a.owner_team,
        v.severity,
        COUNT(v.violation_id) AS violation_count
    FROM violations v
    JOIN interactions i ON v.interaction_id = i.interaction_id
    JOIN agents a ON i.source_agent_id = a.agent_id
    GROUP BY a.owner_team, v.severity
),
team_summary AS (
    SELECT 
        owner_team,
        COALESCE(SUM(violation_count), 0) AS total_violations,
        COALESCE(SUM(CASE WHEN severity = 'critical' THEN violation_count ELSE 0 END), 0) AS critical_count,
        COALESCE(SUM(CASE WHEN severity = 'high' THEN violation_count ELSE 0 END), 0) AS high_count,
        COALESCE(SUM(CASE WHEN severity = 'medium' THEN violation_count ELSE 0 END), 0) AS medium_count,
        COALESCE(SUM(CASE WHEN severity = 'low' THEN violation_count ELSE 0 END), 0) AS low_count
    FROM team_violations
    GROUP BY owner_team
)
SELECT 
    ts.owner_team,
    ts.total_violations,
    ts.critical_count,
    ts.high_count,
    ts.medium_count,
    ts.low_count,
    ROUND((ts.critical_count::NUMERIC / NULLIF(ts.total_violations, 0)) * 100, 2) AS critical_breach_pct
FROM team_summary ts
ORDER BY ts.critical_count DESC, ts.total_violations DESC;

