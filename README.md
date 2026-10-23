# AgentTrust: Multi-Agent Governance & Risk Monitoring Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.2-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue?logo=react)](https://react.dev/)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16.0-336791?logo=postgresql)](https://www.postgresql.org/)
[![MongoDB 7](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Security Audit](https://img.shields.io/badge/npm%20audit-0%20vulnerabilities-brightgreen)](https://npmjs.com/)

AgentTrust is an enterprise-grade runtime governance, compliance telemetry, and containment platform designed for autonomous multi-agent AI ecosystems (A2A). It intercepts agent-to-agent interactions, evaluates them against SLA and security policies, executes automatic containment trigger cascades, and models dynamic posture risk scores.

---

## 1. Demo Credentials (Demo Only)

> [!IMPORTANT]
> The seeded accounts below are strictly for academic evaluation of Role-Based Access Control (RBAC). In production, credentials must never be committed.

| Persona | Username | Password | Role | Permitted Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Administrator** | `admin` | `admin123` | `admin` | Full read/write: Author policies, trigger manual quarantine/release, execute live simulations, compute risk scores. |
| **Compliance Auditor** | `auditor` | `auditor123` | `auditor` | Read-only access: Compliance dashboards, telemetry feeds, active violations posture, MongoDB anomaly leaderboard. |

*Passwords in PostgreSQL are hashed using `pgcrypto` with bcrypt (`bf`, work factor `10`).*

---

## 2. System Architecture & Polyglot Persistence

AgentTrust employs a polyglot persistence architecture, assigning relational governance to **PostgreSQL 16** (Host Port `5433`) and unstructured message telemetry to **MongoDB 7** (Host Port `27017`):

```
+-------------------------------------------------------------------------------+
|                       AGENTTRUST WEB CONSOLE (PORT 3000)                      |
|  - Vanilla CSS Dark Theme (Glassmorphism, Zero Tailwind)                      |
|  - Strict Cookie-Only Auth (httpOnly SameSite=Lax JWT; Zero Web Storage)      |
|  - RoleGate Component (Client-side control hiding, Server-side 403 enforcement)|
+---------------------------------------+---------------------------------------+
                                        | (HTTP Fetch with Credentials)
                                        v
+-------------------------------------------------------------------------------+
|                       NEXT.JS 16 APP ROUTER & API LAYER                       |
|  - Stateless HS256 JWT Verification via 'jose'                                |
|  - Centralized Route Handler Role Enforcement: requireRole(req, allowedRoles) |
|  - Sliding-Window Rate Limiting (Per-Client & Per-Username)                   |
|  - Same-Origin Mutating Request Validation (Origin Header Verification)       |
|  - Parameterized Raw SQL via 'pg' (Strictly NO ORM)                           |
|  - Native Driver Operations via 'mongodb' (Strictly NO ODM)                   |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
       (PostgreSQL: Port 5433)                 (MongoDB: Port 27017)
                    v                                       v
+---------------------------------------+   +-----------------------------------+
|         POSTGRESQL 16 (RELATIONAL)    |   |        MONGODB 7 (DOCUMENTS)      |
|  - users (Bcrypt credentials, RBAC)   |   |  - interaction_logs collection    |
|  - agents (Identity, Status, Certs)   |   |  - Polymorphic agent payloads     |
|  - policies (Governance SLA thresholds|   |  - Compound & unique indexes      |
|  - interactions (Latency Telemetry)   |   |  - 4-Stage threat anomaly pipeline|
|  - violations (Detected breaches)     |   +-----------------------------------+
|  - quarantine_events (Containment)    |
|  - compute_risk_score() (Stored Proc) |
|  - Trigger Cascades (Auto-Quarantine) |
|  - active_violations_view (Rel. View) |
|  - Composite Indexes (234x speedup)   |
+---------------------------------------+
```

---

## 3. Quick Start & Setup Guide

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **Docker Desktop**: Running with WSL2 or Linux container engine
- **Ports**: `3000` (Web App), `5433` (PostgreSQL), `27017` (MongoDB)

### Step-by-Step Installation
1. **Clone & Enter Repository**:
   ```bash
   git clone <repository-url>
   cd DBMS
   ```

2. **Configure Environment Variables**:
   ```bash
   # Copy placeholder template to both .env.local (Next.js) and .env (Docker Compose)
   cp .env.example .env.local
   cp .env.example .env
   ```
   *(Note: Populate `.env.local` with your secure database passwords and a `>= 32` char `JWT_SECRET`).*

3. **Start Database Containers & Run Complete Reset**:
   - **Windows (PowerShell)**:
     ```powershell
     pwsh -ExecutionPolicy Bypass -File db/reset.ps1
     ```
   - **Linux / WSL / macOS (Bash)**:
     ```bash
     chmod +x db/reset.sh
     ./db/reset.sh
     ```
   *This command stops any existing containers, wipes volumes, boots fresh Postgres and Mongo instances, loads all SQL schemas/seeds/triggers/functions/views/indexes, builds Mongo indexes, seeds 45 polymorphic documents, and verifies 100% bidirectional cross-database consistency.*

4. **Install Dependencies & Start Application**:
   ```bash
   npm install
   npm run dev
   ```
   Open **`http://localhost:3000`** in your browser.

---

## 4. Evaluator Walkthrough & Demo Script

Follow this step-by-step procedure to evaluate all system features:

### Step 1: Sign in as Administrator
1. On the initial login modal, click **`ADMIN (Full Control)`** (or enter `admin` / `admin123`).
2. You will be authenticated via an `httpOnly` cookie (`agenttrust_token`). Notice the purple **`ADMIN`** badge in the navbar.

### Step 2: Test the Live Trigger Cascade Simulator
1. On the **Dashboard**, locate the **Runtime Trigger Cascade Simulator** banner.
2. Select **`Prohibited Protocol (Critical Breach -> Auto-Quarantine)`** from the scenario dropdown.
3. Click **`Simulate Interaction`**.
4. Observe the live execution result:
   - PostgreSQL inserts interaction with `protocol = 'A2A/1.0-Legacy-Unencrypted'`.
   - `trg_evaluate_interaction_policies` fires and inserts a `critical` severity violation.
   - `trg_auto_quarantine_on_critical_violation` immediately fires, creating an active quarantine event and marking source agent `Alpha-SecOps-01` as `quarantined`.
   - MongoDB concurrently syncs the raw message log.
   - The Active Quarantines KPI and Containment list update in real time!

### Step 3: Explore the Agent Registry & Recompute Risk
1. Click the **`Agent Registry`** tab in the navbar.
2. Review the registered agents, their cryptographic certificates, and posture scores.
3. Click **`Recompute Risk`** on any agent. This calls the PostgreSQL stored function `compute_risk_score(UUID)`, recalculating penalties over the 30-day window and updating the animated risk meter.
4. Click **`+ Register Agent`** to test agent registration (unique certificate and name constraints enforced).

### Step 4: Author a Governance Policy
1. Click the **`Governance Policies`** tab.
2. Review the active SLA policies and enforcement triggers.
3. Click **`+ Author New Policy`**.
4. Enter Name `Edge Ingress Latency SLA`, Rule Type `latency_d2b`, and Threshold `180.00`.
5. Submit to observe the new rule committed to PostgreSQL.

### Step 5: Test Quarantine Containment & Release
1. Click the **`Violations & Quarantine`** tab.
2. View the **Active Violations Posture** backed by `active_violations_view`.
3. Locate `Alpha-SecOps-01` in the **Quarantine Containment Audit Trail**.
4. Click **`Release Agent`**, enter an audit justification, and confirm.
5. PostgreSQL executes an atomic transaction with `SELECT ... FOR UPDATE`, transitioning the agent back to `active`.

### Step 6: Inspect the MongoDB Anomaly Leaderboard
1. Click the **`MongoDB Anomaly Pipeline`** tab.
2. Observe the **Pipeline Anomaly Leaderboard**: `Theta-Threat-Scanner` is ranked #1 with an anomaly score of **150 pts** due to planted governance bypass headers, oversized payloads (>50KB), and suspicious bytecode commands.
3. Click on any row in the **Polymorphic Raw Payload Inspector** to expand the interactive JSON viewer and inspect raw headers and payloads.

### Step 7: Evaluate Auditor Persona & RoleGate
1. Click **`Sign Out`** in the top right.
2. Click **`AUDITOR (Read-Only)`** (or enter `auditor` / `auditor123`).
3. Notice the cyan **`AUDITOR`** badge in the navbar.
4. Observe that write buttons are safely disabled:
   - On the Dashboard: Simulate button displays `Auditor (Read-Only)`.
   - On Agent Registry: Button displays `+ Register Agent (Admin Only)`.
   - On Governance Policies: Button displays `+ Author Policy (Admin Only)`.
   - On Violations: Containment actions display `Auditor Read-Only`.
5. Direct API write attempts (e.g., `POST /api/agents`, `POST /api/policies`) are strictly rejected by the server with **`403 Forbidden`**.

---

## 5. Automated Test Suite Execution

Run the comprehensive 40-point verification suite:
```bash
node scripts/test_api_matrix.mjs
```

### Verified Test Matrix Coverage:
1. **Unauthenticated Endpoint Gating**: 401 Unauthorized across all protected routes.
2. **Authentication & Cookies**: Bcrypt validation, generic 401 error (no enumeration), strict cookie-only issuance, Bearer header rejection.
3. **RBAC Enforcement**: Auditor read access permitted; write access forbidden (403).
4. **Pessimistic Concurrency**: Simultaneous quarantine requests yield exactly one 200 OK and one 409 Conflict via `SELECT ... FOR UPDATE`.
5. **Stored Function Execution**: `compute_risk_score` mathematical evaluation and audit persistence.
6. **Defensive Controls**: Parameterized SQL injection defense, malformed JSON (400), invalid UUID regex check (400), cross-origin mutating request rejection (403).
7. **MongoDB Aggregation Pipeline**: Pipeline executes and correctly ranks `Theta-Threat-Scanner` at 150 points.
8. **Rate Limiting**: Brute-force protection throttles failed login attempts per username and client address (429).

---

## 6. Documentation Directory Sitemap

Comprehensive documentation is provided in the `docs/` folder:
- **[docs/architecture.md](docs/architecture.md)**: Full system architecture, dual-write flow, and defense-in-depth model.
- **[docs/schema-er-diagram.md](docs/schema-er-diagram.md)**: Mermaid ER diagram, relational schemas, constraints, and data dictionary.
- **[docs/sql-nosql-justification.md](docs/sql-nosql-justification.md)**: In-depth technical justification for SQL vs. NoSQL polyglot persistence.
- **[docs/important-queries.md](docs/important-queries.md)**: Stored procedures, trigger definitions, views, lateral joins, and aggregation pipelines.
- **[docs/benchmark-results.md](docs/benchmark-results.md)**: 200,000 synthetic row composite indexing benchmark (234.6x speedup).
- **[docs/requirement-mapping.md](docs/requirement-mapping.md)**: Coursework requirement-to-feature traceability matrix.
- **[docs/test-results.md](docs/test-results.md)**: Negative constraint tests, cross-database integrity verification, and API matrix logs.
- **[docs/mongo-data-model.md](docs/mongo-data-model.md)**: Unstructured polymorphic document schemas and aggregation pipeline details.
