# Architectural Justification: SQL vs. NoSQL in AgentTrust

## 1. Executive Summary

AgentTrust employs a **Polyglot Persistence Architecture**, intentionally pairing an ACID-compliant relational engine (**PostgreSQL 16**) with a schema-less document database (**MongoDB 7**). This split reflects the operational demands of multi-agent AI ecosystems:
- **Governance, Authorization, and Containment** require strict transactional guarantees, relational integrity, deterministic constraints, and trigger cascades.
- **Agent Communication Telemetry & Payloads** are inherently unstructured, polymorphic, and evolving, demanding high write-throughput and dynamic aggregation capabilities.

---

## 2. Comparative Decision Matrix

| Dimension | PostgreSQL 16 (Relational Engine) | MongoDB 7 (Document Store) |
| :--- | :--- | :--- |
| **System Responsibility** | Identity, RBAC, Governance Policies, SLA Auditing, Containment State Machine | Unstructured Agent Messages, Evolving Headers, Deep Telemetry, Payload Anomaly Detection |
| **Data Structure** | Highly structured, normalized relational tables (7 tables + 1 view) | Polymorphic, nested JSON documents (`interaction_logs`) |
| **Schema Enforcement** | Strict DDL: Primary/Foreign Keys, `CHECK`, `NOT NULL`, `UNIQUE`, `ON DELETE` actions | Dynamic schema-on-read; fields adapt to heterogeneous agent types without migrations |
| **Transaction Semantics** | ACID guarantees, multi-statement transactions, pessimistic row locks (`SELECT ... FOR UPDATE`) | Atomic single-document operations, high-speed write append |
| **Procedural Logic** | PL/pgSQL Stored Functions (`compute_risk_score`), Trigger Cascades (`evaluate_interaction_policies`) | 4-Stage Aggregation Pipelines (`$project`, `$group`, `$project`, `$sort`) |
| **Host Port Mapping** | Port `5433` (isolated from host defaults) | Port `27017` |

---

## 3. Why PostgreSQL for Governance & Containment

1. **Foreign Key Integrity with Cascade/Restrict Rules**:
   - Deleting an agent safely cascades deletions across interactions and risk scores (`ON DELETE CASCADE`), while policies cannot be dropped if active violations reference them (`ON DELETE RESTRICT`).
2. **Deterministic Trigger Cascades**:
   - Autonomous governance requires instantaneous runtime enforcement. When an interaction is inserted, PostgreSQL triggers automatically evaluate latency SLAs and protocol compliance (`trg_evaluate_interaction_policies`). If a critical breach is detected, a secondary trigger immediately isolates the agent (`trg_auto_quarantine_on_critical_violation`).
3. **Pessimistic Row Locking (`SELECT ... FOR UPDATE`)**:
   - When administrators trigger quarantine or release actions, concurrent operators must not cause race conditions. PostgreSQL's explicit transactions with `FOR UPDATE` lock the target agent row, guaranteeing serializable execution.
4. **Partial Unique Indexes**:
   - `idx_single_active_quarantine_per_agent` (`WHERE status = 'active'`) guarantees that an agent cannot have duplicate active quarantines at the database level.
5. **Stored Function Mathematics**:
   - `compute_risk_score(UUID)` computes a normalized risk score across a rolling 30-day window using weighted penalty sums and clamping functions (`LEAST(100.0, GREATEST(0.0, ...))`), inserting immutable audit rows into `risk_scores`.

---

## 4. Why MongoDB for Agent Payloads & Telemetry

1. **Polymorphic Message Payloads**:
   - AI agents communicate across diverse domains (healthcare HL7 payloads, financial FIX messages, code review AST diffs, NLP summaries). Forcing these arbitrary JSON structures into relational tables would require anti-patterns like sparse tables with hundreds of null columns or cumbersome EAV models.
2. **Deeply Nested Telemetry & Headers**:
   - Agent interaction logs include custom headers (`x-agent-signature`, `x-bypass-governance`), command lists (`suspicious_commands`), and dynamic performance metrics that map naturally to BSON documents.
3. **Multi-Stage Threat Aggregation Pipeline**:
   - MongoDB's aggregation engine enables sophisticated real-time behavioral analysis without impacting relational OLTP performance:
     - `$project`: Extracts boolean indicators for governance bypass headers, oversized payloads (>50KB), and dangerous command executions.
     - `$group`: Groups logs by `agent_id`, calculating total interactions and frequency of anomalous indicators.
     - `$project`: Calculates a weighted composite anomaly score ($40 \times \text{Commands} + 30 \times \text{Bypass} + 20 \times \text{Payloads} + 10 \times \text{Errors}$).
     - `$sort`: Orders agents by risk priority for instant display on the governance console.

---

## 5. Cross-Database Referential Integrity Guarantee

In a polyglot persistence architecture, the risk of orphaned data between databases is mitigated via an automated bidirectional verification script:
- [db/mongo/verify-consistency.mjs](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/mongo/verify-consistency.mjs):
  1. Validates that every MongoDB `interaction_log` document has a corresponding `interaction_id` in PostgreSQL `interactions`.
  2. Validates that every PostgreSQL interaction record has a matching document in MongoDB.
  3. Verifies that the MongoDB document `agent_id` strictly matches the PostgreSQL `source_agent_id`.
- This script runs as step 5 of `db/reset.ps1` and `db/reset.sh`, guaranteeing a 100% consistent state on startup.
