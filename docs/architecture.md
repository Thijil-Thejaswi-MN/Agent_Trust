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

---

## 5. Rate Limiter Architecture & Known Limitations

The authentication layer (`app/api/auth/login/route.ts`) implements an in-memory sliding-window rate limiter designed to defend against automated brute-force attacks and credential stuffing.

### Mechanism
- **Per-Client Sliding Window**: Each incoming request is tracked within a 60-second sliding window (default limit: 5 failed attempts per minute).
- **Per-Username Lockout Window**: Each unique `username` submitted in failed authentication attempts is tracked independently. After 5 consecutive failed attempts for a given username within 60 seconds, further attempts targeting that username are throttled with `429 Too Many Requests`.

### Documented Limitations & Operational Trade-offs
1. **Shared Client Bucket when `TRUST_PROXY` is Disabled**:
   - To prevent IP spoofing attacks where an attacker crafts arbitrary `X-Forwarded-For` headers to evade rate limits, AgentTrust ignores `X-Forwarded-For` unless `TRUST_PROXY=true` is explicitly set in `.env.local`.
   - *Limitation*: When `TRUST_PROXY` is off, requests originating from multiple users behind a shared NAT, corporate VPN, or reverse proxy that strips socket information will be lumped into the same client bucket. A single abusive user behind a shared NAT can exhaust the rate limit bucket for all co-located users.
2. **Account Denial-of-Service (DoS) via Per-Username Lockout**:
   - The per-username lockout protects against distributed brute-force attacks where an attacker rotates IP addresses to crack a specific account (e.g., `admin`).
   - *Limitation / Attack Surface*: Because the username lockout triggers regardless of the origin IP, an attacker who knows a target username can deliberately submit 5 incorrect passwords every 60 seconds. This locks the legitimate account for 60 seconds at a time, resulting in a persistent targeted Denial-of-Service against the administrative persona. Production systems would mitigate this using progressive CAPTCHAs, multi-factor authentication (MFA), or out-of-band email unlock tokens rather than indefinite full lockouts.

