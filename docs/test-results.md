# AgentTrust: Comprehensive Test Results & Verification Log

## 1. Relational Constraint & Integrity Tests (`db/tests.sql`)
Executed within a rollback transaction to preserve seed data baseline.

| Test Case | Target Table | Constraint Enforced | Expected SQL Error | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Negative Test 1** | `agents` | `UNIQUE (name)` | `duplicate key value violates unique constraint "agents_name_key"` | Aborted, caught | **PASS** |
| **Negative Test 2** | `agents` | `CHECK (status IN (...))` | `new row for relation "agents" violates check constraint "agents_status_check"` | Aborted, caught | **PASS** |
| **Negative Test 3** | `interactions` | `CHECK (source <> target)` | `new row for relation "interactions" violates check constraint "check_no_self_interaction"` | Aborted, caught | **PASS** |
| **Negative Test 4** | `risk_scores` | `CHECK (score BETWEEN 0 AND 100)` | `new row for relation "risk_scores" violates check constraint "risk_scores_score_value_check"` | Aborted, caught | **PASS** |
| **Negative Test 5** | `policies` | `FOREIGN KEY ON DELETE RESTRICT` | `update or delete on table "policies" violates foreign key constraint "violations_policy_id_fkey"` | Aborted, caught | **PASS** |

---

## 2. Composite Index Performance Benchmark (200,000 Synthetic Rows)
Executed using `EXPLAIN ANALYZE` inside an isolated transaction block.

```sql
EXPLAIN ANALYZE
SELECT interaction_id, source_agent_id, initiated_at, latency_d2b, status
FROM interactions
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001'
ORDER BY initiated_at DESC
LIMIT 50;
```

| Configuration | Plan Details | Buffers Read | Planning Time | Execution Time | Speedup Factor |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Unindexed** (Index Dropped) | Parallel Sequential Scan (2 workers) + Heapsort | 4,217 shared blocks | 0.284 ms | **11.261 ms** | Baseline (1.0x) |
| **Indexed** (`source_agent_id, initiated_at DESC`) | Index Scan using `idx_interactions_source_initiated` | 4 shared blocks | 0.112 ms | **0.048 ms** | **234.6x Speedup** |

---

## 3. Cross-Database Referential Consistency (`verify-consistency.mjs`)
Bidirectional referential integrity verification connecting PostgreSQL (Port 5433) and MongoDB (Port 27017):
- **MongoDB -> PostgreSQL Mapping**: 45 of 45 documents match valid PostgreSQL `interaction_id` records (0 orphaned).
- **PostgreSQL -> MongoDB Mapping**: 45 of 45 PostgreSQL interactions exist in MongoDB (0 missing).
- **Agent Identity Mapping**: 100% matched (`log.agent_id === interaction.source_agent_id`).
- **Result**: **100% PASS**.

---

## 4. API Layer Automated Verification Matrix (`test_api_matrix.mjs`)
Automated test suite covering 40 test cases:

```
================================================================================
AGENTTRUST PHASE 4 & 5: REVISED COOKIE-ONLY FULL VERIFICATION MATRIX
================================================================================

--- SECTION 1: Unauthenticated Endpoint Gating (401 Gating) ---
[PASS] Unauthenticated GET /api/agents returns 401
[PASS] Unauthenticated GET /api/policies returns 401
[PASS] Unauthenticated GET /api/interactions returns 401
[PASS] Unauthenticated GET /api/violations returns 401
[PASS] Unauthenticated GET /api/quarantine returns 401
[PASS] Unauthenticated GET /api/logs returns 401
[PASS] Unauthenticated GET /api/logs/anomalies returns 401

--- SECTION 2: Authentication & Strict Cookie-Only Storage ---
[PASS] Bad credentials return 401 Unauthorized
[PASS] Generic error message returned (no user enumeration)
[PASS] Auditor login returns 200 OK
[PASS] Auditor response body has NO token field (Strict Cookie-Only)
[PASS] Auditor payload contains role 'auditor'
[PASS] Auditor Set-Cookie contains agenttrust_token
[PASS] Admin login returns 200 OK
[PASS] Admin response body has NO token field (Strict Cookie-Only)
[PASS] Admin payload contains role 'admin'
[PASS] Admin Set-Cookie contains agenttrust_token
[PASS] Bearer token is rejected with 401 (Cookie-only enforcement)

--- SECTION 3: RBAC Enforcement ---
[PASS] Auditor can read /api/agents via Cookie (200 OK)
[PASS] Auditor POST /api/agents is 403 Forbidden
[PASS] Auditor POST /api/policies is 403 Forbidden
[PASS] Auditor POST /api/quarantine/action is 403 Forbidden
[PASS] Auditor POST /api/risk/compute is 403 Forbidden (Admin only)

--- SECTION 4: Admin Transactions & Concurrency (SELECT ... FOR UPDATE) ---
[PASS] Found an active agent for quarantine test
Firing 2 simultaneous quarantine requests for same agent...
[PASS] Concurrent quarantine: Exactly one 200 OK and one 409 Conflict
[PASS] Admin can release agent from quarantine (200 OK)
[PASS] Quarantine event status updated to released

--- SECTION 5: Stored Function (compute_risk_score) ---
[PASS] Admin POST /api/risk/compute successfully executes (200 OK)
[PASS] Risk score value is a valid numeric score (0-100)

--- SECTION 6: Defensive Controls & Error Hygiene ---
[PASS] SQL injection payload safely handled (200 OK, 0 matched rows)
[PASS] Malformed JSON returns 400 Bad Request
[PASS] No stack trace or internal SQL in malformed response
[PASS] Invalid UUID returns 400 Bad Request
[PASS] No stack trace in invalid UUID response
[PASS] Cross-origin mutating POST rejected (403 Forbidden)

--- SECTION 7: MongoDB Logs & Aggregation Pipeline ---
[PASS] Auditor can fetch MongoDB logs via Cookie (200 OK)
[PASS] Logs contain polymorphic raw_payload and headers
[PASS] Auditor can run MongoDB anomaly aggregation (200 OK)
[PASS] Top anomalous agent correctly detected as 'Theta-Threat-Scanner' (score: 150)

--- SECTION 8: Rate Limiting Defense (Per-Username Brute Force Protection) ---
[PASS] Consecutive failed logins per username trigger HTTP 429 (no spoofed headers)

================================================================================
TEST SUMMARY: 40 Passed, 0 Failed
================================================================================
```

---

## 5. Mutation Testing Evidence
To demonstrate the rigor of the test suite, two deliberate mutations were injected:
1. **Mutation 1 (Bypass RBAC on write route)**: Commented out `requireRole(req, ["admin"])` on `POST /api/policies`.
   - *Result*: Test immediately **FAILED** with `Auditor POST /api/policies is 403 Forbidden - Status: 400` (route accepted the request past auth check).
2. **Mutation 2 (Corrupt assertion condition)**: Modified expected anomaly score from `150` to `9999`.
   - *Result*: Test immediately **FAILED** with `Top anomalous agent correctly detected (score: 150) - Agent: Theta-Threat-Scanner, Score: 150`.
3. **Reversion**: Both mutations were reverted, restoring clean 40/40 passing results.
