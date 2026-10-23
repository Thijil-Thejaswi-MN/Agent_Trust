-- ============================================================================
-- AgentTrust: Multi-Agent Governance and Risk Monitoring Platform
-- Seed Data Definition (DML)
-- Generates seed users, agents, policies, interactions, and violations.
-- Uses pgcrypto extension for standard bcrypt password hashing.
-- ============================================================================

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. SEED USERS
-- Password for admin: admin123
-- Password for auditor: auditor123
-- ----------------------------------------------------------------------------
INSERT INTO users (user_id, username, password_hash, role) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin', crypt('admin123', gen_salt('bf', 10)), 'admin'),
    ('a0000000-0000-0000-0000-000000000002', 'auditor', crypt('auditor123', gen_salt('bf', 10)), 'auditor')
ON CONFLICT (username) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. SEED AGENTS (10 agents across multiple types, teams, and initial statuses)
-- ----------------------------------------------------------------------------
INSERT INTO agents (agent_id, name, agent_type, owner_team, status, cert_fingerprint, registered_at) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Alpha-SecOps-01', 'Security', 'CyberSec', 'active', 'SHA256:7B:3E:99:1A:4C:E8:11:55:A2:33', NOW() - INTERVAL '30 days'),
    ('b0000000-0000-0000-0000-000000000002', 'Beta-Finance-Ledger', 'Financial', 'FinTech', 'active', 'SHA256:9C:12:44:D1:6E:FA:22:77:B3:44', NOW() - INTERVAL '28 days'),
    ('b0000000-0000-0000-0000-000000000003', 'Gamma-Health-Bot', 'Healthcare', 'BioHealth', 'active', 'SHA256:3A:88:55:F2:7B:0B:33:88:C4:55', NOW() - INTERVAL '25 days'),
    ('b0000000-0000-0000-0000-000000000004', 'Delta-Supply-Router', 'Logistics', 'Operations', 'active', 'SHA256:11:55:99:A3:8C:1C:44:99:D5:66', NOW() - INTERVAL '20 days'),
    ('b0000000-0000-0000-0000-000000000005', 'Epsilon-LLM-Summarizer', 'NLP', 'DataScience', 'active', 'SHA256:44:66:88:B4:9D:2D:55:00:E6:77', NOW() - INTERVAL '18 days'),
    ('b0000000-0000-0000-0000-000000000006', 'Zeta-Code-Reviewer', 'DevOps', 'Engineering', 'active', 'SHA256:22:44:77:C5:AE:3E:66:11:F7:88', NOW() - INTERVAL '15 days'),
    ('b0000000-0000-0000-0000-000000000007', 'Eta-Payment-Gateway', 'Financial', 'FinTech', 'active', 'SHA256:55:77:AA:D6:BF:4F:77:22:A8:99', NOW() - INTERVAL '12 days'),
    ('b0000000-0000-0000-0000-000000000008', 'Theta-Threat-Scanner', 'Security', 'CyberSec', 'quarantined', 'SHA256:88:AA:CC:E7:C0:50:88:33:B9:00', NOW() - INTERVAL '10 days'),
    ('b0000000-0000-0000-0000-000000000009', 'Iota-Customer-Voice', 'NLP', 'Support', 'active', 'SHA256:66:99:BB:F8:D1:61:99:44:CA:11', NOW() - INTERVAL '5 days'),
    ('b0000000-0000-0000-0000-000000000010', 'Kappa-Telemetry-Archiver', 'Infrastructure', 'Platform', 'offline', 'SHA256:33:55:DD:A9:E2:72:00:55:DB:22', NOW() - INTERVAL '2 days')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. SEED POLICIES (5 governance policies created by admin)
-- ----------------------------------------------------------------------------
INSERT INTO policies (policy_id, created_by, name, rule_type, threshold, created_at) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Broker Latency SLA Exceeded', 'latency_d2b', 250.00, NOW() - INTERVAL '20 days'),
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Critical D2D Latency Spike', 'latency_d2d', 800.00, NOW() - INTERVAL '20 days'),
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Reviewer Latency Bottleneck', 'latency_d2rev', 600.00, NOW() - INTERVAL '20 days'),
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Unauthorized Protocol Version', 'protocol_security', 1.00, NOW() - INTERVAL '20 days'),
    ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Zero Trust Certification Mismatch', 'cert_integrity', 1.00, NOW() - INTERVAL '20 days')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. SEED INTERACTIONS (45 realistic interactions)
-- ----------------------------------------------------------------------------
INSERT INTO interactions (interaction_id, source_agent_id, target_agent_id, protocol, status, latency_d2d, latency_d2b, latency_d2rev, initiated_at, completed_at) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'gRPC/v2', 'completed', 45.2, 85.0, 110.5, NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days' + INTERVAL '240 ms'),
    ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000007', 'REST/JSON', 'completed', 120.4, 210.0, 190.2, NOW() - INTERVAL '9 days' + INTERVAL '1 hour', NOW() - INTERVAL '9 days' + INTERVAL '1 hour 520 ms'),
    ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001', 'A2A-Secure', 'failed', 940.0, 340.5, 780.0, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '2060 ms'),
    ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000005', 'gRPC/v2', 'completed', 38.1, 72.4, 88.0, NOW() - INTERVAL '8 days' + INTERVAL '2 hours', NOW() - INTERVAL '8 days' + INTERVAL '2 hours 198 ms'),
    ('d0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 95.0, 140.0, 160.0, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '395 ms'),
    ('d0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000009', 'A2A-Secure', 'completed', 62.0, 110.0, 145.0, NOW() - INTERVAL '7 days' + INTERVAL '3 hours', NOW() - INTERVAL '7 days' + INTERVAL '3 hours 317 ms'),
    ('d0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'gRPC/v2', 'completed', 50.0, 95.0, 105.0, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '250 ms'),
    ('d0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002', 'A2A-Secure', 'completed', 82.5, 130.0, 175.0, NOW() - INTERVAL '6 days' + INTERVAL '4 hours', NOW() - INTERVAL '6 days' + INTERVAL '4 hours 387 ms'),
    ('d0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000004', 'Legacy-RPC', 'failed', 850.0, 410.0, 690.0, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '1950 ms'),
    ('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000003', 'REST/JSON', 'completed', 110.0, 190.0, 210.0, NOW() - INTERVAL '5 days' + INTERVAL '2 hours', NOW() - INTERVAL '5 days' + INTERVAL '2 hours 510 ms'),
    ('d0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'gRPC/v2', 'completed', 40.0, 78.0, 92.0, NOW() - INTERVAL '5 days' + INTERVAL '6 hours', NOW() - INTERVAL '5 days' + INTERVAL '6 hours 210 ms'),
    ('d0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'REST/JSON', 'completed', 75.0, 130.0, 140.0, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days' + INTERVAL '345 ms'),
    ('d0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000007', 'A2A-Secure', 'completed', 88.0, 145.0, 180.0, NOW() - INTERVAL '4 days' + INTERVAL '3 hours', NOW() - INTERVAL '4 days' + INTERVAL '3 hours 413 ms'),
    ('d0000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000009', 'gRPC/v2', 'completed', 55.0, 90.0, 115.0, NOW() - INTERVAL '4 days' + INTERVAL '7 hours', NOW() - INTERVAL '4 days' + INTERVAL '7 hours 260 ms'),
    ('d0000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 68.0, 120.0, 135.0, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '323 ms'),
    ('d0000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000007', 'gRPC/v2', 'completed', 49.0, 88.0, 102.0, NOW() - INTERVAL '3 days' + INTERVAL '2 hours', NOW() - INTERVAL '3 days' + INTERVAL '2 hours 239 ms'),
    ('d0000000-0000-0000-0000-000000000017', 'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001', 'A2A-Secure', 'completed', 63.0, 105.0, 125.0, NOW() - INTERVAL '3 days' + INTERVAL '5 hours', NOW() - INTERVAL '3 days' + INTERVAL '5 hours 293 ms'),
    ('d0000000-0000-0000-0000-000000000018', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'REST/JSON', 'completed', 105.0, 175.0, 200.0, NOW() - INTERVAL '3 days' + INTERVAL '8 hours', NOW() - INTERVAL '3 days' + INTERVAL '8 hours 480 ms'),
    ('d0000000-0000-0000-0000-000000000019', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'gRPC/v2', 'completed', 42.0, 80.0, 95.0, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '217 ms'),
    ('d0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'REST/JSON', 'completed', 80.0, 140.0, 155.0, NOW() - INTERVAL '2 days' + INTERVAL '2 hours', NOW() - INTERVAL '2 days' + INTERVAL '2 hours 375 ms'),
    ('d0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'gRPC/v2', 'completed', 53.0, 92.0, 110.0, NOW() - INTERVAL '2 days' + INTERVAL '4 hours', NOW() - INTERVAL '2 days' + INTERVAL '4 hours 255 ms'),
    ('d0000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000007', 'A2A-Secure', 'completed', 71.0, 118.0, 142.0, NOW() - INTERVAL '2 days' + INTERVAL '7 hours', NOW() - INTERVAL '2 days' + INTERVAL '7 hours 331 ms'),
    ('d0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 90.0, 160.0, 185.0, NOW() - INTERVAL '2 days' + INTERVAL '10 hours', NOW() - INTERVAL '2 days' + INTERVAL '10 hours 435 ms'),
    ('d0000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000005', 'gRPC/v2', 'completed', 48.0, 85.0, 99.0, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '232 ms'),
    ('d0000000-0000-0000-0000-000000000025', 'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'REST/JSON', 'completed', 85.0, 150.0, 170.0, NOW() - INTERVAL '1 day' + INTERVAL '1 hour', NOW() - INTERVAL '1 day' + INTERVAL '1 hour 405 ms'),
    ('d0000000-0000-0000-0000-000000000026', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000009', 'gRPC/v2', 'completed', 56.0, 98.0, 114.0, NOW() - INTERVAL '1 day' + INTERVAL '3 hours', NOW() - INTERVAL '1 day' + INTERVAL '3 hours 268 ms'),
    ('d0000000-0000-0000-0000-000000000027', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'A2A-Secure', 'completed', 65.0, 112.0, 130.0, NOW() - INTERVAL '1 day' + INTERVAL '5 hours', NOW() - INTERVAL '1 day' + INTERVAL '5 hours 307 ms'),
    ('d0000000-0000-0000-0000-000000000028', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 78.0, 135.0, 150.0, NOW() - INTERVAL '1 day' + INTERVAL '8 hours', NOW() - INTERVAL '1 day' + INTERVAL '8 hours 363 ms'),
    ('d0000000-0000-0000-0000-000000000029', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000007', 'gRPC/v2', 'completed', 44.0, 82.0, 96.0, NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours' + INTERVAL '222 ms'),
    ('d0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'REST/JSON', 'completed', 92.0, 158.0, 180.0, NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours' + INTERVAL '430 ms'),
    ('d0000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000003', 'gRPC/v2', 'completed', 51.0, 89.0, 107.0, NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours' + INTERVAL '247 ms'),
    ('d0000000-0000-0000-0000-000000000032', 'b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'A2A-Secure', 'completed', 74.0, 125.0, 149.0, NOW() - INTERVAL '14 hours', NOW() - INTERVAL '14 hours' + INTERVAL '348 ms'),
    ('d0000000-0000-0000-0000-000000000033', 'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000005', 'REST/JSON', 'completed', 83.0, 146.0, 168.0, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours' + INTERVAL '397 ms'),
    ('d0000000-0000-0000-0000-000000000034', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007', 'gRPC/v2', 'completed', 47.0, 84.0, 101.0, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours' + INTERVAL '232 ms'),
    ('d0000000-0000-0000-0000-000000000035', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 99.0, 168.0, 192.0, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours' + INTERVAL '459 ms'),
    ('d0000000-0000-0000-0000-000000000036', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'A2A-Secure', 'completed', 67.0, 115.0, 134.0, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours' + INTERVAL '316 ms'),
    ('d0000000-0000-0000-0000-000000000037', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005', 'gRPC/v2', 'completed', 52.0, 91.0, 109.0, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours' + INTERVAL '252 ms'),
    ('d0000000-0000-0000-0000-000000000038', 'b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'REST/JSON', 'completed', 87.0, 152.0, 174.0, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours' + INTERVAL '413 ms'),
    ('d0000000-0000-0000-0000-000000000039', 'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000006', 'gRPC/v2', 'completed', 46.0, 83.0, 98.0, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours' + INTERVAL '227 ms'),
    ('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001', 'REST/JSON', 'completed', 94.0, 161.0, 182.0, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '437 ms'),
    ('d0000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'A2A-Secure', 'completed', 61.0, 108.0, 128.0, NOW() - INTERVAL '90 minutes', NOW() - INTERVAL '90 minutes' + INTERVAL '297 ms'),
    ('d0000000-0000-0000-0000-000000000042', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 'gRPC/v2', 'completed', 54.0, 94.0, 112.0, NOW() - INTERVAL '60 minutes', NOW() - INTERVAL '60 minutes' + INTERVAL '260 ms'),
    ('d0000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000006', 'REST/JSON', 'completed', 81.0, 142.0, 162.0, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes' + INTERVAL '385 ms'),
    ('d0000000-0000-0000-0000-000000000044', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'A2A-Secure', 'completed', 70.0, 121.0, 141.0, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '15 minutes' + INTERVAL '332 ms'),
    ('d0000000-0000-0000-0000-000000000045', 'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'gRPC/v2', 'completed', 49.0, 87.0, 104.0, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes' + INTERVAL '240 ms')
ON CONFLICT (interaction_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. SEED VIOLATIONS
-- ----------------------------------------------------------------------------
INSERT INTO violations (violation_id, interaction_id, policy_id, severity, description, detected_at) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'critical', 'Extreme latency anomaly: D2D latency reached 940ms exceeding 800ms threshold', NOW() - INTERVAL '8 days'),
    ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'high', 'Broker latency reached 340.5ms exceeding 250ms SLA', NOW() - INTERVAL '8 days'),
    ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000004', 'critical', 'Unauthorized legacy RPC protocol detected in production A2A stream', NOW() - INTERVAL '5 days'),
    ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'medium', 'Broker latency degradation reached 410ms on Legacy-RPC', NOW() - INTERVAL '5 days'),
    ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'low', 'Minor latency deviation: D2B 210ms nearing 250ms threshold', NOW() - INTERVAL '9 days')
ON CONFLICT (violation_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. SEED QUARANTINE EVENTS
-- Active quarantine on Theta-Threat-Scanner linked to its critical violation
-- ----------------------------------------------------------------------------
INSERT INTO quarantine_events (quarantine_id, agent_id, violation_id, status, quarantined_at, released_at) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000001', 'active', NOW() - INTERVAL '8 days', NULL)
ON CONFLICT (quarantine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. SEED RISK SCORES
-- Baseline risk scores reflecting historical governance posture
-- ----------------------------------------------------------------------------
INSERT INTO risk_scores (score_id, agent_id, score_value, computed_at) VALUES
    ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 5.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 15.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 2.50, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 8.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 4.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000006', 6.50, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000007', 12.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000008', 92.50, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000009', 3.00, NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000010', 0.00, NOW() - INTERVAL '1 day')
ON CONFLICT (score_id) DO NOTHING;
