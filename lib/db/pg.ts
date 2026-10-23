// ============================================================================
// AgentTrust: PostgreSQL Client Singleton
// Uses official 'pg' library with raw parameterized queries.
// No ORM. Credentials strictly read from environment variables.
// ============================================================================

import pg, { Pool, QueryResult, QueryResultRow } from "pg";

const { Pool: PgPool } = pg;

interface GlobalPg {
  _pgPool?: Pool;
}

const globalWithPg = global as typeof globalThis & GlobalPg;

function createPool(): Pool {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5433", 10);
  const database = process.env.POSTGRES_DB || "agenttrust";
  const user = process.env.POSTGRES_USER || "agenttrust_admin";
  const password = process.env.POSTGRES_PASSWORD;

  if (!password) {
    throw new Error("Missing required POSTGRES_PASSWORD environment variable in .env.local");
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

const pool = globalWithPg._pgPool || createPool();
if (process.env.NODE_ENV !== "production") {
  globalWithPg._pgPool = pool;
}

/**
 * Execute a raw, parameterized SQL query against PostgreSQL.
 * Guarantees all variables are bound through parameter placeholders ($1, $2...).
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development" && duration > 200) {
    console.warn(`[SLOW QUERY] ${duration}ms: ${text.slice(0, 80)}...`);
  }
  return res;
}

/**
 * Acquire a dedicated client for multi-statement transactions (BEGIN / COMMIT / ROLLBACK).
 */
export async function getClient() {
  return pool.connect();
}

export default pool;
