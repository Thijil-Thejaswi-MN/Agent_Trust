-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Stored Functions Definition
-- Target DBMS: PostgreSQL 16+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNCTION: compute_risk_score(p_agent_id UUID)
-- Purpose: Evaluates historical and recent policy violations for an agent,
--          computes a normalized risk score between 0.00 and 100.00,
--          persists the result to risk_scores, and returns the score.
--
-- Grading/Logic Explanation:
-- 1. Aggregates all violations associated with interactions where the agent was
--    the initiating source (source_agent_id = p_agent_id).
-- 2. Applies weighted severity multipliers:
--      - Critical violation: +35.00
--      - High violation:     +20.00
--      - Medium violation:   +10.00
--      - Low violation:      +5.00
-- 3. Adds interaction failure penalty (+10.00 per failed interaction).
-- 4. Uses LEAST(100.00, GREATEST(0.00, ...)) to guarantee the score stays
--    within the valid 0.00 - 100.00 range specified by the CHECK constraint.
-- 5. Writes an immutable audit row to risk_scores with the timestamp.
-- ----------------------------------------------------------------------------
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
    -- Verify the agent exists
    SELECT EXISTS (SELECT 1 FROM agents WHERE agent_id = p_agent_id) INTO v_agent_exists;
    IF NOT v_agent_exists THEN
        RAISE EXCEPTION 'Agent with ID % does not exist', p_agent_id;
    END IF;

    -- 1. Calculate violation penalties based on severity
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
    WHERE i.source_agent_id = p_agent_id;

    -- 2. Calculate operational failure penalties
    SELECT COALESCE(COUNT(*) * 10.00, 0.00)
    INTO v_failure_penalty
    FROM interactions
    WHERE source_agent_id = p_agent_id
      AND status = 'failed';

    -- 3. Sum penalties and clamp between 0.00 and 100.00
    v_raw_score := v_violation_penalty + v_failure_penalty;
    v_final_score := LEAST(100.00, GREATEST(0.00, v_raw_score))::NUMERIC(5, 2);

    -- 4. Persist newly computed score to risk_scores table
    INSERT INTO risk_scores (score_id, agent_id, score_value, computed_at)
    VALUES (gen_random_uuid(), p_agent_id, v_final_score, NOW());

    RETURN v_final_score;
END;
$$;

COMMENT ON FUNCTION compute_risk_score(UUID) IS 
'Computes weighted risk score for an agent based on violation severity and failures, persists score, and returns value.';
