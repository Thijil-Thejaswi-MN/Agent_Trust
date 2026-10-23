# AgentTrust: Multi-Agent Governance and Risk Monitoring Platform

AgentTrust monitors interactions between autonomous AI agents (A2A-style calls), evaluates them against runtime governance policies, flags violations, auto-quarantines offending agents, and calculates a dynamic risk posture per agent.

---

## Demo Credentials (Demo Only)

> [!IMPORTANT]
> The seeded user accounts below are strictly for academic demonstration and evaluation of Role-Based Access Control (RBAC). In production, credentials must never be committed.

| Username | Demo Password | Role | Access Scope |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `admin` | Full read/write: policy configuration, manual quarantine/release, system overview |
| `auditor` | `auditor123` | `auditor` | Read-only access: compliance dashboards, violation feeds, interaction logs |

Passwords in the PostgreSQL database are hashed using `pgcrypto` with bcrypt (`bf`, work factor `10`).

---

## Architectural Split: Why Two Databases?

- **PostgreSQL 16 (Relational Engine)**:
  - Manages structured relational entities (`agents`, `users`, `policies`, `interactions`, `violations`, `quarantine_events`, `risk_scores`).
  - Guarantees ACID compliance, foreign key integrity, trigger execution cascades, and transactional state isolation.
- **MongoDB 7 (Document Store)**:
  - Stores polymorphic, schema-less agent message payloads (`interaction_logs`).
  - Supports evolving protocol shapes, deep nested payloads, and aggregation pipelines for behavioral anomaly detection.

---

## Quick Start & Setup

1. Copy `.env.example` to `.env.local` and `.env`:
   ```bash
   cp .env.example .env.local
   cp .env.example .env
   ```
2. Start the database containers:
   ```bash
   docker compose up -d
   ```
   *Note: PostgreSQL is exposed on host port `5433` (container port 5432) to prevent conflicts with local database installations. MongoDB is on port `27017`.*

3. Reset or Re-seed at any time:
   - PowerShell: `.\db\reset.ps1`
   - Bash: `./db\reset.sh`
