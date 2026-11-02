# Important Database Queries & Logic in AgentTrust

## 1. Stored Function: `compute_risk_score(UUID)`
Defined in [db/03_functions.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/03_functions.sql). Computes a normalized risk score between 0.00 and 100.00 across a 30-day rolling window, clamps the value, and persists an audit row to `risk_scores`:

```sql
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
    -- Verify target agent exists in registry
    SELECT EXISTS (SELECT 1 FROM agents WHERE agent_id = p_agent_id) INTO v_agent_exists;
    IF NOT v_agent_exists THEN
        RAISE EXCEPTION 'Agent with ID % does not exist in registry', p_agent_id;
    END IF;

    -- 1. Calculate violation penalties across active 30-day rolling window
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

    -- 2. Calculate operational failure penalties across 30-day window
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
```

---

## 2. Trigger Cascade: Policy Evaluation & Idempotent Auto-Quarantine
Defined in [db/04_triggers.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/04_triggers.sql).

### Trigger 1: `trg_evaluate_interaction_policies` (AFTER INSERT ON interactions)
Evaluates newly inserted interactions against active policies (broker latency SLA > 250ms, D2D latency > 800ms, reviewer latency > 600ms, prohibited protocol `%Legacy%`) and writes violation records:
```sql
CREATE TRIGGER trg_evaluate_interaction_policies
    AFTER INSERT ON interactions
    FOR EACH ROW
    EXECUTE FUNCTION evaluate_interaction_policies();
```

### Trigger 2: `trg_auto_quarantine_on_critical_violation` (AFTER INSERT ON violations)
Fires strictly when `NEW.severity = 'critical'`. Idempotently checks if the offending source agent already has an active quarantine. If not, it creates a quarantine record and updates `agents.status = 'quarantined'`:
```sql
CREATE TRIGGER trg_auto_quarantine_on_critical_violation
    AFTER INSERT ON violations
    FOR EACH ROW
    WHEN (NEW.severity = 'critical')
    EXECUTE FUNCTION auto_quarantine_on_critical_violation();
```

---

## 3. Transactional Isolation & Concurrency (`SELECT ... FOR UPDATE`)
Used in [app/api/quarantine/action/route.ts](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/app/api/quarantine/action/route.ts#L48-L95). Acquires an exclusive row-level lock on the target agent, preventing concurrent quarantine or release race conditions:
```sql
BEGIN;

-- Lock target agent row exclusively
SELECT agent_id, name, agent_type, owner_team, status 
FROM agents 
WHERE agent_id = $1 
FOR UPDATE;

-- Transition state safely
UPDATE agents SET status = 'quarantined' WHERE agent_id = $1;

INSERT INTO quarantine_events (agent_id, violation_id, status, quarantined_at)
VALUES ($1, NULL, 'active', NOW());

COMMIT;
```

---

## 4. Lateral Join Query (Agent Registry with Latest Risk Score)
Used in [app/api/agents/route.ts](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/app/api/agents/route.ts#L65-L85). Joins each agent with their single most recent risk score row efficiently without full grouping overhead:
```sql
SELECT 
    a.agent_id,
    a.name,
    a.agent_type,
    a.owner_team,
    a.status,
    a.cert_fingerprint,
    a.registered_at,
    r.score_value AS latest_risk_score,
    r.computed_at AS risk_computed_at
FROM agents a
LEFT JOIN LATERAL (
    SELECT score_value, computed_at
    FROM risk_scores
    WHERE agent_id = a.agent_id
    ORDER BY computed_at DESC
    LIMIT 1
) r ON true
ORDER BY a.registered_at DESC;
```

---

## 5. Composite Index Optimization Query (234x Speedup)
Evaluated in [db/tests.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/tests.sql) and documented in [docs/benchmark-results.md](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/docs/benchmark-results.md). Filters interactions by `source_agent_id` and sorts by `initiated_at DESC`:
```sql
-- Benchmark Query
EXPLAIN ANALYZE
SELECT interaction_id, source_agent_id, initiated_at, latency_d2b, status
FROM interactions
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001'
ORDER BY initiated_at DESC
LIMIT 50;

-- Supporting Composite Index
CREATE INDEX idx_interactions_source_initiated 
ON interactions (source_agent_id, initiated_at DESC);
```
- **Unindexed Execution Time**: `11.261 ms` (Parallel Sequential Scan on 200,000 rows + Heapsort).
- **Indexed Execution Time**: `0.048 ms` (Index Scan directly fulfilling both equality filter and ordering).
- **Performance Gain**: **234.6x speedup**.

---

## 6. MongoDB 4-Stage Aggregation Pipeline (Threat Score Ranking)
Used in [app/api/logs/anomalies/route.ts](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/app/api/logs/anomalies/route.ts) and [db/mongo/pipeline.mjs](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/mongo/pipeline.mjs):
```javascript
[
  // Stage 1: Project boolean threat flags
  {
    $project: {
      agent_id: 1,
      interaction_id: 1,
      timestamp: 1,
      has_bypass_header: { $cond: [{ $ifNull: ["$headers.x-bypass-governance", false] }, 1, 0] },
      has_large_payload: {
        $cond: [
          { $or: [
            { $gt: [{ $ifNull: ["$raw_payload.anomalous_payload_bytes", 0] }, 50000] },
            { $gt: [{ $ifNull: ["$raw_payload.payload_bytes", 0] }, 50000] }
          ]},
          1, 0
        ]
      },
      has_suspicious_command: {
        $cond: [{ $gt: [{ $size: { $ifNull: ["$raw_payload.suspicious_commands", []] } }, 0] }, 1, 0]
      },
      has_error: { $cond: [{ $ifNull: ["$raw_payload.error", false] }, 1, 0] }
    }
  },
  // Stage 2: Group by agent
  {
    $group: {
      _id: "$agent_id",
      total_interactions: { $sum: 1 },
      bypass_attempts: { $sum: "$has_bypass_header" },
      large_payload_events: { $sum: "$has_large_payload" },
      suspicious_commands_detected: { $sum: "$has_suspicious_command" },
      error_events: { $sum: "$has_error" },
      sample_interaction_ids: { $push: "$interaction_id" },
      latest_event_time: { $max: "$timestamp" }
    }
  },
  // Stage 3: Calculate weighted composite anomaly score
  {
    $project: {
      agent_id: "$_id",
      total_interactions: 1,
      bypass_attempts: 1,
      large_payload_events: 1,
      suspicious_commands_detected: 1,
      error_events: 1,
      latest_event_time: 1,
      sample_interaction_ids: { $slice: ["$sample_interaction_ids", 3] },
      computed_anomaly_score: {
        $add: [
          { $multiply: ["$suspicious_commands_detected", 40] },
          { $multiply: ["$bypass_attempts", 30] },
          { $multiply: ["$large_payload_events", 20] },
          { $multiply: ["$error_events", 10] }
        ]
      }
    }
  },
  // Stage 4: Sort descending by anomaly score
  {
    $sort: { computed_anomaly_score: -1, total_interactions: -1 }
  }
]
```

---

## 7. Recursive CTE: Agent Blast Radius Analysis
Defined in [db/07_advanced_queries.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/07_advanced_queries.sql) and executed via [app/api/agents/blast-radius/route.ts](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/app/api/agents/blast-radius/route.ts). Starting from an audited source agent, recursively traces pairwise interactions (`source` $\to$ `target`) up to $N$ hops to evaluate systemic blast radius, using an array cycle guard to halt loops:

```sql
WITH RECURSIVE blast_radius AS (
    -- Anchor Member: Direct outbound interactions from starting agent (Depth 1)
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
    WHERE i.source_agent_id = $1 -- Target agent UUID

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
      AND br.depth < $2 -- Max depth limit
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
```

---

## 8. Non-Recursive CTE: Team Violation Breakdown
Defined in [db/07_advanced_queries.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/07_advanced_queries.sql). Computes multi-level severity aggregation per engineering team:

```sql
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
```

---

## 9. Database-Level Role-Based Access Control (RBAC) & Column Security
Defined in [db/08_roles.sql](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/08_roles.sql). Implements PostgreSQL group roles (`at_admin_role`, `at_auditor_role`) and login users (`agenttrust_app_admin`, `agenttrust_app_auditor`), with column-level `SELECT` restrictions protecting `users.password_hash` and a `SECURITY DEFINER` function for credential verification:

```sql
-- Security Definer Login Helper (auditor can authenticate without reading users.password_hash)
CREATE OR REPLACE FUNCTION get_login_record(p_username VARCHAR)
RETURNS TABLE (
    user_id UUID,
    username VARCHAR(64),
    password_hash VARCHAR(255),
    role VARCHAR(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT u.user_id, u.username, u.password_hash, u.role
    FROM users u
    WHERE u.username = p_username;
END;
$$;
```
