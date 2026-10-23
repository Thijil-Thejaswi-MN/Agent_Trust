-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Database Triggers Definition
-- Target DBMS: PostgreSQL 16+
--
-- ARCHITECTURAL ORDERING NOTE (ACADEMIC DESIGN DECISION):
-- This script (04_triggers.sql) is intentionally loaded AFTER 02_seed.sql.
-- Why? The seed script establishes historical baseline data (including historical
-- violations and existing quarantine events). Loading triggers after seed prevents
-- artificial side-effects or duplicate quarantine executions from firing against
-- historical records during container bootstrap.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRIGGER 1: evaluate_interaction_policies
-- Fires: AFTER INSERT ON interactions FOR EACH ROW
-- Purpose: Evaluates incoming agent-to-agent telemetry against active governance
--          policies in the policies table. Automatically inserts violation records
--          into the violations table when thresholds are exceeded.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evaluate_interaction_policies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    r_policy RECORD;
BEGIN
    -- 1. Check D2D Latency Policy (Critical SLA)
    FOR r_policy IN 
        SELECT policy_id, threshold, name 
        FROM policies 
        WHERE rule_type = 'latency_d2d'
    LOOP
        IF NEW.latency_d2d IS NOT NULL AND NEW.latency_d2d > r_policy.threshold THEN
            INSERT INTO violations (violation_id, interaction_id, policy_id, severity, description, detected_at)
            VALUES (
                gen_random_uuid(),
                NEW.interaction_id,
                r_policy.policy_id,
                'critical',
                format('Critical SLA Breach: D2D latency %sms exceeded policy threshold of %sms (%s)', 
                       NEW.latency_d2d, r_policy.threshold, r_policy.name),
                NOW()
            );
        END IF;
    END LOOP;

    -- 2. Check D2B Broker Latency Policy (High SLA)
    FOR r_policy IN 
        SELECT policy_id, threshold, name 
        FROM policies 
        WHERE rule_type = 'latency_d2b'
    LOOP
        IF NEW.latency_d2b IS NOT NULL AND NEW.latency_d2b > r_policy.threshold THEN
            INSERT INTO violations (violation_id, interaction_id, policy_id, severity, description, detected_at)
            VALUES (
                gen_random_uuid(),
                NEW.interaction_id,
                r_policy.policy_id,
                'high',
                format('High Latency Warning: Broker latency %sms exceeded threshold of %sms (%s)', 
                       NEW.latency_d2b, r_policy.threshold, r_policy.name),
                NOW()
            );
        END IF;
    END LOOP;

    -- 3. Check D2Rev Reviewer Latency Policy (Medium SLA)
    FOR r_policy IN 
        SELECT policy_id, threshold, name 
        FROM policies 
        WHERE rule_type = 'latency_d2rev'
    LOOP
        IF NEW.latency_d2rev IS NOT NULL AND NEW.latency_d2rev > r_policy.threshold THEN
            INSERT INTO violations (violation_id, interaction_id, policy_id, severity, description, detected_at)
            VALUES (
                gen_random_uuid(),
                NEW.interaction_id,
                r_policy.policy_id,
                'medium',
                format('Reviewer Latency Delay: Review latency %sms exceeded threshold of %sms (%s)', 
                       NEW.latency_d2rev, r_policy.threshold, r_policy.name),
                NOW()
            );
        END IF;
    END LOOP;

    -- 4. Check Protocol Security Policy (Critical)
    IF NEW.protocol ILIKE '%Legacy%' THEN
        FOR r_policy IN 
            SELECT policy_id, name 
            FROM policies 
            WHERE rule_type = 'protocol_security'
        LOOP
            INSERT INTO violations (violation_id, interaction_id, policy_id, severity, description, detected_at)
            VALUES (
                gen_random_uuid(),
                NEW.interaction_id,
                r_policy.policy_id,
                'critical',
                format('Security Breach: Prohibited protocol "%s" detected in agent communication stream (%s)', 
                       NEW.protocol, r_policy.name),
                NOW()
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_interaction_policies ON interactions;
CREATE TRIGGER trg_evaluate_interaction_policies
    AFTER INSERT ON interactions
    FOR EACH ROW
    EXECUTE FUNCTION evaluate_interaction_policies();

COMMENT ON FUNCTION evaluate_interaction_policies() IS 
'Evaluates newly inserted interactions against governance policies and writes violations automatically.';

-- ----------------------------------------------------------------------------
-- TRIGGER 2: auto_quarantine_on_critical_violation
-- Fires: AFTER INSERT ON violations FOR EACH ROW WHEN (NEW.severity = 'critical')
-- Purpose: Automatic containment of offending agents.
--
-- IDEMPOTENCY SPECIFICATION:
-- Identifies the offending source agent from the linked interaction.
-- If the agent already has an active quarantine (status = "active"), it cleanly
-- skips inserting a duplicate quarantine event, preventing unique index collision
-- and preserving transaction continuity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_quarantine_on_critical_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_source_agent_id UUID;
    v_already_active  BOOLEAN;
BEGIN
    -- Identify the source agent responsible for the violating interaction
    SELECT source_agent_id INTO v_source_agent_id
    FROM interactions
    WHERE interaction_id = NEW.interaction_id;

    IF v_source_agent_id IS NULL THEN
        RAISE WARNING 'No interaction found for violation %', NEW.violation_id;
        RETURN NEW;
    END IF;

    -- Idempotency check: see if agent is already actively quarantined
    SELECT EXISTS (
        SELECT 1 
        FROM quarantine_events 
        WHERE agent_id = v_source_agent_id 
          AND status = 'active'
    ) INTO v_already_active;

    IF NOT v_already_active THEN
        -- 1. Create active quarantine audit record
        INSERT INTO quarantine_events (
            quarantine_id,
            agent_id,
            violation_id,
            status,
            quarantined_at,
            released_at
        ) VALUES (
            gen_random_uuid(),
            v_source_agent_id,
            NEW.violation_id,
            'active',
            NOW(),
            NULL
        );

        -- 2. Update agent operational status in agents registry
        UPDATE agents 
        SET status = 'quarantined' 
        WHERE agent_id = v_source_agent_id;

        RAISE NOTICE 'Auto-quarantined agent % due to critical violation %', 
                     v_source_agent_id, NEW.violation_id;
    ELSE
        RAISE NOTICE 'Agent % is already quarantined; skipping duplicate quarantine creation for violation %', 
                     v_source_agent_id, NEW.violation_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_quarantine_critical ON violations;
CREATE TRIGGER trg_auto_quarantine_critical
    AFTER INSERT ON violations
    FOR EACH ROW
    WHEN (NEW.severity = 'critical')
    EXECUTE FUNCTION auto_quarantine_on_critical_violation();

COMMENT ON FUNCTION auto_quarantine_on_critical_violation() IS 
'Idempotently isolates offending source agents into quarantine upon critical severity violation insertion.';
