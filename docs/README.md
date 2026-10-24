# AgentTrust Academic Documentation Directory

This directory contains the complete technical, architectural, and evaluation documentation suite for the **AgentTrust: Multi-Agent Governance and Risk Monitoring Platform**, developed for DBMS Level 3 Experiential Learning (PES University, under Dr. Nagasundari S).

---

## Documentation Reconciled Catalog

| Document | Description & Key Coverage |
| :--- | :--- |
| **[project-report.md](project-report.md)** | **Primary Formal Course Report (Requirement 14)**: Synthesizes problem statement, objectives, scope, functional requirements, team responsibilities, ER diagram, relational schemas, data dictionary, advanced DB features, screenshots, and future vector DB roadmap. |
| **[requirement-mapping.md](requirement-mapping.md)** | **Course Requirements Traceability Matrix**: Line-by-line verification evidence mapping across all **18 numbered course requirements** and the suggested minimum technology stack. |
| **[architecture.md](architecture.md)** | **System Architecture & Defense Specification**: High-level block diagram, dual-database write pipeline, cookie-only JWT flow, defense-in-depth matrix, and documented rate limiter limitations. |
| **[benchmark-results.md](benchmark-results.md)** | **Composite Indexing Empirical Benchmark**: `EXPLAIN ANALYZE` evaluation on 200,000 synthetic rows showing a **234.6x execution speedup** (11.261 ms down to 0.048 ms). |
| **[schema-er-diagram.md](schema-er-diagram.md)** | **Relational Database Design**: Visual Mermaid ER Diagram, 7 normalized 3NF tables, constraints, foreign key cascade actions, and comprehensive data dictionary. |
| **[sql-nosql-justification.md](sql-nosql-justification.md)** | **Polyglot Persistence Justification**: Theoretical and empirical analysis justifying PostgreSQL for ACID governance and MongoDB for high-throughput polymorphic telemetry. |
| **[important-queries.md](important-queries.md)** | **SQL & NoSQL Query Catalogue**: DDL examples, multi-table JOINs, GROUP BY/HAVING queries, PL/pgSQL stored procedures, trigger definitions, and MongoDB aggregation pipelines. |
| **[mongo-data-model.md](mongo-data-model.md)** | **Document NoSQL Model**: Schema definitions for `interaction_logs`, single/compound/unique indexes, and the 4-stage threat anomaly pipeline. |
| **[risk-score-specification.md](risk-score-specification.md)** | **Mathematical Risk Model**: Formal specification of `compute_risk_score(UUID)`, severity weighting, failure penalties, 30-day temporal decay, and posture bands. |
| **[test-results.md](test-results.md)** | **Verification & Test Evidence**: Negative constraint tests (`db/tests.sql`), bidirectional cross-database consistency verification, and full API test matrix logs. |
| **[screenshots/](screenshots/)** | **Application Interface Captures**: 8 verified UI screenshots covering Login, Dashboard, Trigger Simulator, Agent Registry, Governance Policies, Violations/Quarantine, MongoDB Pipeline, and Auditor Persona. |
