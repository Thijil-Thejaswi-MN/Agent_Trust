// ============================================================================
// AgentTrust: Quarantine Audit Trail API Route
// GET: Returns historical and active quarantine events
// Access: admin, auditor
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db/pg";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status && (status === "active" || status === "released")) {
      conditions.push(`qe.status = $${paramIndex++}`);
      params.push(status);
    }

    if (agentId) {
      conditions.push(`qe.agent_id = $${paramIndex++}`);
      params.push(agentId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        qe.quarantine_id,
        qe.agent_id,
        a.name AS agent_name,
        a.agent_type,
        a.owner_team,
        a.status AS current_agent_status,
        qe.violation_id,
        v.severity AS violation_severity,
        v.description AS violation_description,
        qe.status AS quarantine_status,
        qe.quarantined_at,
        qe.released_at
      FROM quarantine_events qe
      JOIN agents a ON qe.agent_id = a.agent_id
      LEFT JOIN violations v ON qe.violation_id = v.violation_id
      ${whereClause}
      ORDER BY qe.quarantined_at DESC
      LIMIT 100
    `;

    const result = await query(sql, params);
    return NextResponse.json({
      events: result.rows,
      count: result.rowCount,
    });
  } catch (error: any) {
    console.error("[API ERROR: /api/quarantine GET]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch quarantine events" },
      { status: 500 }
    );
  }
}
