// ============================================================================
// AgentTrust: /api/agents
// GET: List agents with allowlisted filters and parameterized search (admin, auditor)
// POST: Register new agent with DB validation (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

// Strict allowlists to defend against SQL Injection on dynamic clauses
const ALLOWED_SORT_COLUMNS = ["name", "registered_at", "status", "agent_type", "owner_team"];
const ALLOWED_STATUSES = ["active", "quarantined", "offline"];

export async function GET(req: NextRequest) {
  // 1. Role Check: Admin and Auditor allowed
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const agentType = searchParams.get("agent_type") || "";
    const ownerTeam = searchParams.get("owner_team") || "";
    const sortBy = searchParams.get("sort_by") || "registered_at";
    const sortOrder = searchParams.get("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // 2. Validate sort column against allowlist
    const safeSortColumn = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : "registered_at";

    // 3. Build dynamic parameterized WHERE clauses
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search.trim()) {
      conditions.push(`(name ILIKE $${paramIndex} OR cert_fingerprint ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (status && ALLOWED_STATUSES.includes(status)) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (agentType.trim()) {
      conditions.push(`agent_type = $${paramIndex}`);
      params.push(agentType.trim());
      paramIndex++;
    }

    if (ownerTeam.trim()) {
      conditions.push(`owner_team = $${paramIndex}`);
      params.push(ownerTeam.trim());
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 4. Execute query with latest risk score joined
    const sql = `
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
      ${whereClause}
      ORDER BY a.${safeSortColumn} ${sortOrder};
    `;

    const result = await query(sql, params);
    return NextResponse.json({ agents: result.rows, count: result.rowCount });
  } catch (err: any) {
    console.error("Agents GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve agents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // 1. Role Check: Strictly Admin Only
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.name || !body.agent_type || !body.owner_team || !body.cert_fingerprint) {
      return NextResponse.json(
        { error: "Missing required fields: name, agent_type, owner_team, cert_fingerprint" },
        { status: 400 }
      );
    }

    const { name, agent_type, owner_team, cert_fingerprint, status } = body;

    // Validate status if provided
    const safeStatus = status && ALLOWED_STATUSES.includes(status) ? status : "active";

    // 2. Parameterized INSERT
    const sql = `
      INSERT INTO agents (name, agent_type, owner_team, cert_fingerprint, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const result = await query(sql, [name, agent_type, owner_team, cert_fingerprint, safeStatus]);
    return NextResponse.json({ success: true, agent: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    // Gracefully handle UNIQUE constraint violations
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "Conflict: An agent with this name or certificate fingerprint already exists." },
        { status: 409 }
      );
    }
    console.error("Agents POST error:", err);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
