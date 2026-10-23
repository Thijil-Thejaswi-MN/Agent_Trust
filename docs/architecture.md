# AgentTrust: System Architecture & Security Specification

## 1. High-Level Architecture Overview

AgentTrust is an enterprise-grade multi-agent governance and runtime policy enforcement platform. It pairs Next.js 16 (React 19 + TypeScript) with a polyglot persistence database tier consisting of PostgreSQL 16 on port 5433 and MongoDB 7 on port 27017.

```
+-------------------------------------------------------------------------------+
|                                CLIENT BROWSER                                 |
|  - Vanilla CSS Dark Theme (Glassmorphic)                                      |
|  - Cookie-Only Auth (Zero Web Storage Tokens)                                 |
|  - Client-Side RoleGate (Hides admin controls from auditor)                   |
+---------------------------------------+---------------------------------------+
                                        | (HTTPS / HTTP Credentials Included)
                                        v
+-------------------------------------------------------------------------------+
|                       NEXT.JS 16 API & ROUTE HANDLERS                         |
|  - Stateless HS256 JWT Verification via jose (httpOnly SameSite=Lax Cookie)   |
|  - Centralized Route Handler Role Enforcement: requireRole(req, allowedRoles) |
|  - In-Memory Sliding-Window Rate Limiter (Per-Client & Per-Username)          |
|  - Cross-Origin Mutating Request Rejection (Origin Header Validation)         |
|  - Parameterized Query Builder (pg singleton, strictly NO ORM)                |
|  - Native MongoDB Driver (mongodb singleton, strictly NO ODM)                 |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
    (Port 5433: Raw SQL)                    (Port 27017: Native Driver)
                    v                                       v
+---------------------------------------+   +-----------------------------------+
|         POSTGRESQL 16 (RELATIONAL)    |   |        MONGODB 7 (DOCUMENTS)      |
|  - Users (Bcrypt hashed credentials)  |   |  - interaction_logs collection    |
|  - Agents (Status, Certs, Identity)   |   |  - Polymorphic payloads           |
|  - Governance Policies (SLA limits)   |   |  - Compound & Unique indexes      |
|  - Interactions (Latency Telemetry)   |   |  - 4-Stage Anomaly Pipeline       |
|  - Violations (Detected breaches)     |   +-----------------------------------+
|  - Quarantine Events (Audit trail)    |
|  - Stored Functions (compute_risk)    |
|  - Trigger Cascades (auto_quarantine) |
|  - Relational Views (active_viol.)    |
|  - Composite Indexes (234x speedup)   |
+---------------------------------------+
```

---

## 2. Authentication, Session & RBAC Architecture

### Stateless JWT Cookie Flow
1. **Authentication (`POST /api/auth/login`)**:
   - Compares plaintext password against `users.password_hash` using `bcrypt.compare`.
   - Mints a signed JWT (`HS256`, 8-hour expiry) encoded with `userId`, `username`, and `role`.
   - Sets the token exclusively in an `httpOnly`, `SameSite=Lax` cookie (`agenttrust_token`).
   - The token is **never** serialized into the response body.
   - In production (`NODE_ENV=production`), the `Secure` flag is automatically appended.
2. **Session Verification (`lib/auth.ts`)**:
   - `getSession(req)` extracts `agenttrust_token` exclusively from `req.headers.get("cookie")` or Next.js `cookies()`.
   - `Authorization: Bearer` headers are ignored and rejected with `401 Unauthorized`.
3. **Route Handler RBAC (`requireRole`)**:
   - Every Route Handler invokes `requireRole(req, ["admin"])` or `requireRole(req, ["admin", "auditor"])`.
   - Unauthorized calls immediately return `401 Unauthorized` or `403 Forbidden` before querying database singletons.

---

## 3. Dual-Database Write Architecture (`POST /api/simulate`)

When runtime interactions are simulated or ingested:
1. **Phase 1: PostgreSQL Atomic Ingestion**:
   - An interaction is inserted into `interactions`.
   - Database trigger `trg_evaluate_interaction_policies` fires immediately, checking latency thresholds and protocol security (`%Legacy%`).
   - If a critical breach occurs, `trg_auto_quarantine_on_critical_violation` immediately isolates the source agent in `quarantine_events` and marks `agents.status = 'quarantined'`.
2. **Phase 2: MongoDB Polymorphic Ingestion**:
   - The raw message payload, headers, and metadata are written to MongoDB `interaction_logs`.
3. **Partial Failure Isolation**:
   - If MongoDB encounters an error, the endpoint returns **HTTP 207 Multi-Status** with a partial-failure notification, acknowledging the committed PostgreSQL transaction while highlighting the MongoDB sync issue.

---

## 4. Comprehensive Defense Matrix

| Security Threat | Platform Mitigation Mechanism |
| :--- | :--- |
| **SQL Injection (SQLi)** | 100% of SQL queries use parameterized placeholders (`$1, $2, ...`) via the official `pg` driver. No string interpolation. Sort columns validated against strict string allowlists. |
| **XSS Credential Theft** | JWT tokens are stored exclusively in `httpOnly` cookies. The frontend stores zero state in `localStorage` or `sessionStorage`. |
| **Cross-Site Scripting (XSS)** | React JSX automatically HTML-escapes all strings before DOM insertion. Zero instances of `dangerouslySetInnerHTML`. Malicious payloads (e.g., `<img src=x onerror=alert(1)>`) render harmlessly as inert text. |
| **Cross-Site Request Forgery (CSRF)** | `SameSite=Lax` cookie attribute combined with strict `Origin` header validation in `verifySameOrigin(req)` for all mutating methods (`POST`, `PUT`, `DELETE`). |
| **Brute Force Credential Guessing** | Sliding-window in-memory rate limiter throttling by client connection and per-username (5 attempts/min). Returns HTTP 429. |
| **Secret Leakage** | All database and JWT secrets are read strictly from `.env.local` using `process.env`. Zero hard-coded credentials in source code (`git grep` clean). |
