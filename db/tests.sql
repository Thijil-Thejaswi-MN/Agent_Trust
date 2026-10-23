-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Advanced SQL Verification & Academic Test Suite (Phase 2)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: END-TO-END TRIGGER CASCADE
-- An interaction with D2D latency > 800ms is inserted for active agent Alpha-SecOps-01.
-- Cascade:
--   1. interactions row inserted.
--   2. evaluate_interaction_policies trigger fires -> creates critical violation.
--   3. auto_quarantine_on_critical_violation trigger fires ->
--      sets agent status = 'quarantined' and inserts active quarantine_events row.
-- ----------------------------------------------------------------------------
-- Pre-check: Verify Alpha-SecOps-01 is initially active
SELECT agent_id, name, status FROM agents WHERE name = 'Alpha-SecOps-01';

-- Insert violating interaction (D2D = 950ms exceeds 800ms threshold)
INSERT INTO interactions (
    interaction_id,
    source_agent_id,
    target_agent_id,
    protocol,
    status,
    latency_d2d,
    latency_d2b,
    latency_d2rev,
    initiated_at
) VALUES (
    'd1111111-1111-1111-1111-111111111111',
    'b0000000-0000-0000-0000-000000000001', -- Alpha-SecOps-01
    'b0000000-0000-0000-0000-000000000002', -- Beta-Finance-Ledger
    'gRPC/v2',
    'completed',
    950.00, -- Exceeds 800ms Critical SLA threshold!
    120.00,
    150.00,
    NOW()
);

-- Post-check 1: Verify critical violation was auto-created
SELECT violation_id, severity, description 
FROM violations 
WHERE interaction_id = 'd1111111-1111-1111-1111-111111111111';

-- Post-check 2: Verify agent status was auto-updated to 'quarantined'
SELECT agent_id, name, status FROM agents WHERE name = 'Alpha-SecOps-01';

-- Post-check 3: Verify active quarantine event was auto-created
SELECT quarantine_id, agent_id, status, quarantined_at 
FROM quarantine_events 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active';

-- ----------------------------------------------------------------------------
-- TEST 2: TRIGGER IDEMPOTENCY TEST
-- Insert a SECOND critical interaction for the ALREADY quarantined agent.
-- Expected: The critical violation is logged, but the auto-quarantine trigger
-- detects the existing active quarantine and safely skips duplicate insertion
-- without throwing a unique constraint error or failing the transaction.
-- ----------------------------------------------------------------------------
INSERT INTO interactions (
    interaction_id,
    source_agent_id,
    target_agent_id,
    protocol,
    status,
    latency_d2d,
    latency_d2b,
    latency_d2rev,
    initiated_at
) VALUES (
    'd2222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-000000000001', -- Already quarantined Alpha-SecOps-01
    'b0000000-0000-0000-0000-000000000003',
    'gRPC/v2',
    'completed',
    990.00, -- Critical D2D violation
    100.00,
    100.00,
    NOW()
);

-- Verify second violation is recorded
SELECT count(*) AS total_violations_for_interaction 
FROM violations 
WHERE interaction_id = 'd2222222-2222-2222-2222-222222222222';

-- Verify there is still EXACTLY ONE active quarantine for Alpha-SecOps-01
SELECT count(*) AS active_quarantines_count 
FROM quarantine_events 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active';

-- ----------------------------------------------------------------------------
-- TEST 3: NON-CRITICAL VIOLATION TEST
-- Insert an interaction that only breaches a Medium threshold (D2Rev = 650ms).
-- Expected: A medium violation is inserted, but NO quarantine event is created,
-- and the agent remains 'active'.
-- ----------------------------------------------------------------------------
INSERT INTO interactions (
    interaction_id,
    source_agent_id,
    target_agent_id,
    protocol,
    status,
    latency_d2d,
    latency_d2b,
    latency_d2rev,
    initiated_at
) VALUES (
    'd3333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-000000000004', -- Delta-Supply-Router (active)
    'b0000000-0000-0000-0000-000000000005',
    'REST/JSON',
    'completed',
    100.00, -- Normal
    150.00, -- Normal
    750.00, -- Exceeds 600ms Reviewer Latency policy
    NOW()
);

-- Verify medium violation was logged
SELECT severity, description 
FROM violations 
WHERE interaction_id = 'd3333333-3333-3333-3333-333333333333';

-- Verify Delta-Supply-Router remains active and is NOT quarantined
SELECT name, status FROM agents WHERE name = 'Delta-Supply-Router';
SELECT count(*) AS delta_quarantines FROM quarantine_events 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000004';

-- ----------------------------------------------------------------------------
-- TEST 4: STORED FUNCTION TEST (compute_risk_score)
-- Compares computed risk score for an offending agent vs a clean agent.
-- ----------------------------------------------------------------------------
SELECT 
    'Alpha-SecOps-01 (High Violations)' AS agent_profile,
    compute_risk_score('b0000000-0000-0000-0000-000000000001') AS risk_score;

SELECT 
    'Iota-Customer-Voice (Clean Agent)' AS agent_profile,
    compute_risk_score('b0000000-0000-0000-0000-000000000009') AS risk_score;

-- Verify new score row was written into risk_scores
SELECT agent_id, score_value, computed_at 
FROM risk_scores 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000001'
ORDER BY computed_at DESC 
LIMIT 1;

-- ----------------------------------------------------------------------------
-- TEST 5: ACTIVE VIOLATIONS VIEW TEST
-- Selects from active_violations_view showing joined details
-- ----------------------------------------------------------------------------
SELECT 
    severity, 
    source_agent_name, 
    target_agent_name, 
    policy_name, 
    is_source_quarantined
FROM active_violations_view
ORDER BY detected_at DESC
LIMIT 5;

-- ----------------------------------------------------------------------------
-- TEST 6: TRANSACTION INTEGRITY & ROLLBACK PROOF
-- Proves that if an intentional failure occurs mid-transaction, ROLLBACK
-- guarantees zero partial updates remain in the database.
-- ----------------------------------------------------------------------------
BEGIN;

-- Step A: Insert a speculative quarantine event
INSERT INTO quarantine_events (
    quarantine_id, agent_id, status, quarantined_at
) VALUES (
    'f9999999-9999-9999-9999-999999999999',
    'b0000000-0000-0000-0000-000000000004',
    'active',
    NOW()
);

-- Step B: Update agent status to quarantined
UPDATE agents 
SET status = 'quarantined' 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000004';

-- Step C: Force rollback
ROLLBACK;

-- Verify rollback: quarantine event does NOT exist and agent status is still 'active'
SELECT count(*) AS rollback_quarantine_check 
FROM quarantine_events 
WHERE quarantine_id = 'f9999999-9999-9999-9999-999999999999';

SELECT name, status AS rollback_agent_status 
FROM agents 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000004';

-- ----------------------------------------------------------------------------
-- TEST 7: EXPLAIN ANALYZE INDEX OPTIMIZATION EVIDENCE
-- Demonstrates query plan and execution benefits provided by B-Tree indexes:
-- 1. Sequential scan requires a separate memory sort pass.
-- 2. Index scan using idx_interactions_source_time retrieves rows pre-sorted
--    with 0 sorting overhead and direct index condition lookup.
-- ----------------------------------------------------------------------------
-- (A) Plan without forcing index (cost-based sequential scan + sort)
EXPLAIN ANALYZE 
SELECT * FROM interactions 
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001' 
ORDER BY initiated_at DESC;

-- (B) Plan leveraging composite B-Tree index (Index Scan, eliminating sort step)
SET enable_seqscan = off;
EXPLAIN ANALYZE 
SELECT * FROM interactions 
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001' 
ORDER BY initiated_at DESC;
RESET enable_seqscan;

