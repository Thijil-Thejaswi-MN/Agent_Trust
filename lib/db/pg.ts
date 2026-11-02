// ============================================================================
// AgentTrust: Dual-Pool PostgreSQL Client Singleton (Database-Level RBAC)
// Routes queries through role-dedicated connection pools (Admin vs Auditor).
// Least privilege by default: query() and getClient() REQUIRE a role argument.
// No ORM. Credentials strictly read from environment variables.
// ============================================================================

import pg, { Pool, QueryResult, QueryResultRow } from "pg";

const { Pool: PgPool } = pg;

export type DbRole = "admin" | "auditor";

interface GlobalPg {
  _pgAdminPool?: Pool;
  _pgAuditorPool?: Pool;
}

const globalWithPg = global as typeof globalThis & GlobalPg;

function createPool(userRole: DbRole): Pool {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5433", 10);
  const database = process.env.POSTGRES_DB || "agenttrust";

  const isAuditor = userRole === "auditor";
  const user = isAuditor
    ? process.env.POSTGRES_AUDITOR_USER
    : process.env.POSTGRES_ADMIN_USER;
  const password = isAuditor
    ? process.env.POSTGRES_AUDITOR_PASSWORD
    : process.env.POSTGRES_ADMIN_PASSWORD;

  if (!user || !password) {
    throw new Error(
      `FATAL DATABASE RBAC CONFIGURATION ERROR: Missing required credentials for role '${userRole}'. ` +
      `Ensure POSTGRES_${isAuditor ? "AUDITOR" : "ADMIN"}_USER and POSTGRES_${isAuditor ? "AUDITOR" : "ADMIN"}_PASSWORD are set in .env.local.`
    );
  }

  return new PgPool({
    host,
    port,
    database,
    user,
    password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

const adminPool = globalWithPg._pgAdminPool || createPool("admin");
const auditorPool = globalWithPg._pgAuditorPool || createPool("auditor");

if (process.env.NODE_ENV !== "production") {
  globalWithPg._pgAdminPool = adminPool;
  globalWithPg._pgAuditorPool = auditorPool;
}

/**
 * Execute a raw, parameterized SQL query against PostgreSQL.
 * Least privilege: 'role' is mandatory with no default.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  role: DbRole,
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const targetPool = role === "auditor" ? auditorPool : adminPool;
  const start = Date.now();
  const res = await targetPool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development" && duration > 200) {
    console.warn(`[SLOW QUERY] ${duration}ms: ${text.slice(0, 80)}...`);
  }
  return res;
}

/**
 * Acquire a dedicated client for multi-statement transactions (BEGIN / COMMIT / ROLLBACK).
 * Least privilege: 'role' is mandatory with no default.
 */
export async function getClient(role: DbRole) {
  const targetPool = role === "auditor" ? auditorPool : adminPool;
  return targetPool.connect();
}

export default adminPool;
