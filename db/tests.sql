-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Advanced SQL Verification & Academic Test Suite (Repeatable Test Script)
-- Target DBMS: PostgreSQL 16+
--
-- REPEATABILITY DESIGN:
-- The entire test suite is wrapped inside a BEGIN ... ROLLBACK transaction block.
-- Intermediate sub-tests use SAVEPOINTs so that tests can verify failure modes
-- without aborting the outer transaction.
-- Result: Running this script tests every trigger, function, view, transaction,
-- and honest index benchmark, leaving the baseline seed data 100% pristine.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- BASELINE PRE-CHECKS
-- ----------------------------------------------------------------------------
SELECT 'BASELINE ROW COUNTS BEFORE TESTS' AS label;
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'agents', count(*) FROM agents
UNION ALL SELECT 'policies', count(*) FROM policies
UNION ALL SELECT 'interactions', count(*) FROM interactions
UNION ALL SELECT 'violations', count(*) FROM violations
UNION ALL SELECT 'quarantine_events', count(*) FROM quarantine_events
UNION ALL SELECT 'risk_scores', count(*) FROM risk_scores;

-- Verify Alpha-SecOps-01 is initially active
SELECT agent_id, name, status FROM agents WHERE name = 'Alpha-SecOps-01';

-- ----------------------------------------------------------------------------
-- TEST 1: END-TO-END TRIGGER CASCADE
-- Inserting an interaction with D2D latency > 800ms for active agent Alpha-SecOps-01.
-- Cascade:
--   1. interactions row inserted.
--   2. evaluate_interaction_policies trigger fires -> creates critical violation.
--   3. auto_quarantine_on_critical_violation trigger fires ->
--      sets agent status = 'quarantined' and inserts active quarantine_events row.
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

-- Post-check 1: Critical violation auto-created
SELECT violation_id, severity, description 
FROM violations 
WHERE interaction_id = 'd1111111-1111-1111-1111-111111111111';

-- Post-check 2: Agent status auto-updated to 'quarantined'
SELECT agent_id, name, status FROM agents WHERE name = 'Alpha-SecOps-01';

-- Post-check 3: Active quarantine event auto-created
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
-- Compares count(*) of violations table vs active_violations_view,
-- confirming the view includes all violations with rich relational context.
-- ----------------------------------------------------------------------------
SELECT count(*) AS total_violations_count FROM violations;
SELECT count(*) AS active_violations_view_count FROM active_violations_view;

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
-- TEST 6: TRANSACTION INTEGRITY & ROLLBACK PROOF (Using SAVEPOINT)
-- Proves that if an intentional failure occurs mid-transaction, ROLLBACK
-- guarantees zero partial updates remain in the database.
-- ----------------------------------------------------------------------------
SAVEPOINT sp_rollback_test;

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

-- Step C: Force rollback to savepoint
ROLLBACK TO SAVEPOINT sp_rollback_test;

-- Verify rollback: speculative quarantine event does NOT exist and agent status is still 'active'
SELECT count(*) AS rollback_quarantine_check 
FROM quarantine_events 
WHERE quarantine_id = 'f9999999-9999-9999-9999-999999999999';

SELECT name, status AS rollback_agent_status 
FROM agents 
WHERE agent_id = 'b0000000-0000-0000-0000-000000000004';

-- ----------------------------------------------------------------------------
-- TEST 6B: NEGATIVE CONSTRAINT INTEGRITY TESTS
-- Verifies that invalid data breaches are trapped and rejected by database CHECK and UNIQUE constraints.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Negative Test 1: Duplicate agent name (UNIQUE)
    BEGIN
        INSERT INTO agents (name, agent_type, owner_team, cert_fingerprint) 
        VALUES ('Alpha-SecOps-01', 'security_scanner', 'SecOps', 'SHA256:NEW_DUPLICATE_NAME');
        RAISE EXCEPTION 'Negative Test 1 FAILED: Duplicate agent name was accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Negative Test 1 PASSED: Duplicate agent name rejected by UNIQUE constraint';
    END;

    -- Negative Test 2: Invalid agent status (CHECK)
    BEGIN
        INSERT INTO agents (name, agent_type, owner_team, cert_fingerprint, status) 
        VALUES ('Bad-Status-Agent', 'security_scanner', 'SecOps', 'SHA256:BADSTATUS', 'compromised');
        RAISE EXCEPTION 'Negative Test 2 FAILED: Invalid status was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 2 PASSED: Invalid status rejected by CHECK constraint';
    END;

    -- Negative Test 3: Self interaction check (CHECK source <> target)
    BEGIN
        INSERT INTO interactions (source_agent_id, target_agent_id, protocol, latency_d2d)
        VALUES ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'gRPC/v2', 50.0);
        RAISE EXCEPTION 'Negative Test 3 FAILED: Self-interaction was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 3 PASSED: Self-interaction rejected by check_no_self_interaction';
    END;

    -- Negative Test 4: Negative latency check (CHECK check_latency_non_negative)
    BEGIN
        INSERT INTO interactions (source_agent_id, target_agent_id, protocol, latency_d2d)
        VALUES ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'gRPC/v2', -15.5);
        RAISE EXCEPTION 'Negative Test 4 FAILED: Negative latency was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 4 PASSED: Negative latency rejected by check_latency_non_negative';
    END;

    -- Negative Test 5: Risk score out of bounds > 100.0 (CHECK risk_scores_score_value_check)
    BEGIN
        INSERT INTO risk_scores (agent_id, score_value)
        VALUES ('b0000000-0000-0000-0000-000000000001', 150.00);
        RAISE EXCEPTION 'Negative Test 5 FAILED: Out-of-bounds risk score was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 5 PASSED: Score 150.00 rejected by risk_scores_score_value_check';
    END;

    -- Negative Test 6: Invalid interaction status (CHECK check_interaction_status)
    BEGIN
        INSERT INTO interactions (source_agent_id, target_agent_id, protocol, status, latency_d2d)
        VALUES ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'gRPC/v2', 'corrupted_status', 50.0);
        RAISE EXCEPTION 'Negative Test 6 FAILED: Invalid interaction status was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 6 PASSED: Invalid status rejected by check_interaction_status';
    END;

    -- Negative Test 7: Non-positive policy threshold (CHECK check_policy_threshold_positive)
    BEGIN
        INSERT INTO policies (name, rule_type, threshold)
        VALUES ('Zero-Threshold-Policy', 'latency_d2d', 0.0);
        RAISE EXCEPTION 'Negative Test 7 FAILED: Threshold = 0 was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Negative Test 7 PASSED: Non-positive threshold rejected by check_policy_threshold_positive';
    END;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 7: HONEST INDEX BENCHMARK WITH 200,000 SYNTHETIC ROWS
-- Generates 200,000 synthetic interactions inside the transaction, runs ANALYZE,
-- tests EXPLAIN ANALYZE without the index, creates the index, runs ANALYZE,
-- tests EXPLAIN ANALYZE with the index.
-- (No enable_seqscan tricks; PostgreSQL planner genuinely chooses the Index Scan)
-- ----------------------------------------------------------------------------
-- Step 1: Temporarily drop interactions indexes for unindexed benchmark
DROP INDEX IF EXISTS idx_interactions_source_time;
DROP INDEX IF EXISTS idx_interactions_initiated_at_desc;
DROP INDEX IF EXISTS idx_interactions_source_agent_id;

-- Step 2: Disable trigger for high-throughput synthetic bulk load
ALTER TABLE interactions DISABLE TRIGGER trg_evaluate_interaction_policies;

-- Step 3: Insert 200,000 realistic interactions
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
)
SELECT 
    gen_random_uuid(),
    CASE (i % 8)
        WHEN 0 THEN 'b0000000-0000-0000-0000-000000000001'::uuid
        WHEN 1 THEN 'b0000000-0000-0000-0000-000000000002'::uuid
        WHEN 2 THEN 'b0000000-0000-0000-0000-000000000003'::uuid
        WHEN 3 THEN 'b0000000-0000-0000-0000-000000000004'::uuid
        WHEN 4 THEN 'b0000000-0000-0000-0000-000000000005'::uuid
        WHEN 5 THEN 'b0000000-0000-0000-0000-000000000006'::uuid
        WHEN 6 THEN 'b0000000-0000-0000-0000-000000000007'::uuid
        ELSE 'b0000000-0000-0000-0000-000000000008'::uuid
    END,
    'b0000000-0000-0000-0000-000000000009'::uuid,
    'gRPC/v2',
    'completed',
    45.0 + (i % 20),
    80.0 + (i % 30),
    100.0 + (i % 40),
    NOW() - (i || ' seconds')::interval
FROM generate_series(1, 200000) AS s(i);

-- Re-enable trigger
ALTER TABLE interactions ENABLE TRIGGER trg_evaluate_interaction_policies;

-- Update optimizer statistics
ANALYZE interactions;

-- Step 4: Plan WITHOUT index (Full Parallel Table Scan + Memory Sort)
SELECT 'PLAN WITHOUT COMPOSITE INDEX (TABLE SCAN + TOP-N SORT)' AS benchmark_phase;
EXPLAIN ANALYZE 
SELECT * FROM interactions 
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001' 
ORDER BY initiated_at DESC 
LIMIT 50;

-- Step 5: Build composite B-Tree index
CREATE INDEX idx_interactions_source_time 
    ON interactions (source_agent_id, initiated_at DESC);

ANALYZE interactions;

-- Step 6: Plan WITH index (Direct B-Tree Index Scan with Zero Sort Overhead)
SELECT 'PLAN WITH COMPOSITE INDEX (DIRECT B-TREE INDEX SCAN)' AS benchmark_phase;
EXPLAIN ANALYZE 
SELECT * FROM interactions 
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001' 
ORDER BY initiated_at DESC 
LIMIT 50;

-- ----------------------------------------------------------------------------
-- TEST 7: DATABASE-LEVEL RBAC NEGATIVE TESTS
-- Tests that PostgreSQL kernel enforces permissions strictly for each role:
--   1. at_auditor_role / agenttrust_app_auditor: CANNOT INSERT, UPDATE, DELETE, EXECUTE, or SELECT password_hash
--   2. at_admin_role / agenttrust_app_admin: CANNOT DROP TABLE or ALTER TABLE
-- ----------------------------------------------------------------------------
SELECT 'RUNNING DATABASE-LEVEL RBAC PERMISSION VERIFICATION' AS label;

DO $$
DECLARE
    v_auditor_ins_failed BOOLEAN := false;
    v_auditor_upd_failed BOOLEAN := false;
    v_auditor_del_failed BOOLEAN := false;
    v_auditor_exec_failed BOOLEAN := false;
    v_auditor_pw_failed BOOLEAN := false;
    v_admin_drop_failed BOOLEAN := false;
    v_admin_alter_failed BOOLEAN := false;
BEGIN
    -- 1. Test Auditor Restrictions
    SET LOCAL ROLE agenttrust_app_auditor;

    -- a. Attempt INSERT as auditor
    BEGIN
        INSERT INTO agents (name, agent_type, owner_team, cert_fingerprint)
        VALUES ('Unauthorized-Auditor-Agent', 'Test', 'TestTeam', 'SHA256:AUD_FAIL');
    EXCEPTION WHEN insufficient_privilege THEN
        v_auditor_ins_failed := true;
    END;

    -- b. Attempt UPDATE as auditor
    BEGIN
        UPDATE agents SET status = 'offline' WHERE name = 'Alpha-SecOps-01';
    EXCEPTION WHEN insufficient_privilege THEN
        v_auditor_upd_failed := true;
    END;

    -- c. Attempt DELETE as auditor
    BEGIN
        DELETE FROM interactions WHERE interaction_id = 'd0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN insufficient_privilege THEN
        v_auditor_del_failed := true;
    END;

    -- d. Attempt direct EXECUTE compute_risk_score as auditor
    BEGIN
        PERFORM compute_risk_score('b0000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN insufficient_privilege THEN
        v_auditor_exec_failed := true;
    END;

    -- e. Attempt SELECT password_hash as auditor (Column-level security check)
    BEGIN
        PERFORM password_hash FROM users;
    EXCEPTION WHEN insufficient_privilege THEN
        v_auditor_pw_failed := true;
    END;

    -- 2. Test Admin DDL Denial (app_admin is not table owner)
    SET LOCAL ROLE agenttrust_app_admin;

    -- a. Attempt DROP TABLE as app_admin
    BEGIN
        DROP TABLE interactions CASCADE;
    EXCEPTION WHEN insufficient_privilege THEN
        v_admin_drop_failed := true;
    END;

    -- b. Attempt ALTER TABLE as app_admin
    BEGIN
        ALTER TABLE agents ADD COLUMN malicious_tag TEXT;
    EXCEPTION WHEN insufficient_privilege THEN
        v_admin_alter_failed := true;
    END;

    RESET ROLE;

    IF NOT (v_auditor_ins_failed AND v_auditor_upd_failed AND v_auditor_del_failed AND v_auditor_exec_failed AND v_auditor_pw_failed) THEN
        RAISE EXCEPTION 'RBAC Audit Failed: Auditor was able to execute restricted operations! (Ins: %, Upd: %, Del: %, Exec: %, PwHash: %)',
            v_auditor_ins_failed, v_auditor_upd_failed, v_auditor_del_failed, v_auditor_exec_failed, v_auditor_pw_failed;
    END IF;

    IF NOT (v_admin_drop_failed AND v_admin_alter_failed) THEN
        RAISE EXCEPTION 'RBAC DDL Audit Failed: App Admin was able to perform DDL table mutations! (Drop: %, Alter: %)',
            v_admin_drop_failed, v_admin_alter_failed;
    END IF;

    RAISE NOTICE 'RBAC Verification Passed: Auditor DML/Execute/Password-Hash and Admin DDL both rejected.';
END $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK ALL TEST DATA & SYNTHETIC BENCHMARK ROWS
-- ----------------------------------------------------------------------------
ROLLBACK;

-- ----------------------------------------------------------------------------
-- POST-TEST VERIFICATION
-- Confirms that row counts and agent statuses are 100% untouched after running tests.
-- ----------------------------------------------------------------------------
SELECT 'ROW COUNTS AFTER ROLLBACK (IDENTICAL TO BASELINE SEED)' AS label;
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'agents', count(*) FROM agents
UNION ALL SELECT 'policies', count(*) FROM policies
UNION ALL SELECT 'interactions', count(*) FROM interactions
UNION ALL SELECT 'violations', count(*) FROM violations
UNION ALL SELECT 'quarantine_events', count(*) FROM quarantine_events
UNION ALL SELECT 'risk_scores', count(*) FROM risk_scores;

SELECT agent_id, name, status FROM agents WHERE name = 'Alpha-SecOps-01';
