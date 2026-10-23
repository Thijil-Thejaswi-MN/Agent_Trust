-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Stored Functions Definition
-- Target DBMS: PostgreSQL 16+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNCTION: compute_risk_score(p_agent_id UUID)
-- Purpose: Evaluates policy violations and interaction failures for an agent,
--          computes a normalized risk score between 0.00 and 100.00,
--          persists the result to risk_scores, and returns the score.
--
-- ============================================================================
-- MATHEMATICAL FORMULATION & ALGORITHM SPECIFICATION:
-- ============================================================================
-- 1. Evaluated Scope:
--    All interactions initiated by the target agent (source_agent_id = p_agent_id)
--    within the active 30-day governance rolling window:
--    (i.initiated_at >= NOW() - INTERVAL '30 days').
--
-- 2. Severity Weight Multipliers:
--      - Critical Violation:  +35.00 points (severe SLA breaches, forbidden protocols)
--      - High Violation:      +20.00 points (broker latency SLA violations)
--      - Medium Violation:    +10.00 points (reviewer latency delays)
--      - Low Violation:       +5.00  points (minor latency anomalies)
--
-- 3. Operational Reliability Penalty:
--      - Interaction Failure: +10.00 points per interaction with status = 'failed'
--
-- 4. Clamping & Normalization Function:
--      RawScore = Sum(SeverityWeights) + Sum(FailurePenalties)
--      FinalScore = LEAST(100.00, GREATEST(0.00, RawScore))::NUMERIC(5, 2)
--    Guarantees score strictly respects database CHECK (score_value BETWEEN 0.0 AND 100.0).
--
-- 5. Audit Persistence:
--    Inserts an immutable row into risk_scores(score_id, agent_id, score_value, computed_at)
--    for real-time dashboard tracking and historical trend analysis.
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_risk_score(p_agent_id UUID)
RETURNS NUMERIC(5, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    v_violation_penalty NUMERIC(10, 2) := 0.0;
    v_failure_penalty   NUMERIC(10, 2) := 0.0;
    v_raw_score         NUMERIC(10, 2) := 0.0;
    v_final_score       NUMERIC(5, 2)  := 0.0;
    v_agent_exists      BOOLEAN;
BEGIN
    -- Verify the agent exists in the registry
    SELECT EXISTS (SELECT 1 FROM agents WHERE agent_id = p_agent_id) INTO v_agent_exists;
    IF NOT v_agent_exists THEN
        RAISE EXCEPTION 'Agent with ID % does not exist in registry', p_agent_id;
    END IF;

    -- 1. Calculate violation penalties across the 30-day governance window
    SELECT COALESCE(SUM(
        CASE 
            WHEN v.severity = 'critical' THEN 35.00
            WHEN v.severity = 'high'     THEN 20.00
            WHEN v.severity = 'medium'   THEN 10.00
            WHEN v.severity = 'low'      THEN 5.00
            ELSE 0.00
        END
    ), 0.00)
    INTO v_violation_penalty
    FROM violations v
    JOIN interactions i ON v.interaction_id = i.interaction_id
    WHERE i.source_agent_id = p_agent_id
      AND i.initiated_at >= (NOW() - INTERVAL '30 days');

    -- 2. Calculate operational failure penalties across the 30-day window
    SELECT COALESCE(COUNT(*) * 10.00, 0.00)
    INTO v_failure_penalty
    FROM interactions
    WHERE source_agent_id = p_agent_id
      AND status = 'failed'
      AND initiated_at >= (NOW() - INTERVAL '30 days');

    -- 3. Sum penalties and clamp strictly between 0.00 and 100.00
    v_raw_score := v_violation_penalty + v_failure_penalty;
    v_final_score := LEAST(100.00, GREATEST(0.00, v_raw_score))::NUMERIC(5, 2);

    -- 4. Persist newly computed score to risk_scores table
    INSERT INTO risk_scores (score_id, agent_id, score_value, computed_at)
    VALUES (gen_random_uuid(), p_agent_id, v_final_score, NOW());

    RETURN v_final_score;
END;
$$;

COMMENT ON FUNCTION compute_risk_score(UUID) IS 
'Computes weighted risk score (0.00-100.00) based on severity weights, failure penalties, and a 30-day window, persisting an audit record.';
