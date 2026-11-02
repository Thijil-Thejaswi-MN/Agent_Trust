// ============================================================================
// AgentTrust: Stored Function Execution API Route
// POST: Invokes PostgreSQL stored function compute_risk_score(UUID)
// Access: admin strictly
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db/pg";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // Restricted strictly to admin
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  let body: { agent_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { agent_id } = body;
  if (!agent_id) {
    return NextResponse.json({ error: "Missing required field: agent_id (UUID)" }, { status: 400 });
  }

  if (!UUID_REGEX.test(agent_id)) {
    return NextResponse.json({ error: "Invalid agent_id: Must be a valid UUID" }, { status: 400 });
  }

  try {
    // 1. Invoke stored procedure compute_risk_score($1)
    const execResult = await query<{ score: string }>(
      auth.user.role,
      "SELECT compute_risk_score($1) AS score",
      [agent_id]
    );

    const scoreValue = parseFloat(execResult.rows[0].score);

    // 2. Fetch agent info and historical scores for context
    const agentResult = await query(
      auth.user.role,
      "SELECT agent_id, name, agent_type, owner_team, status FROM agents WHERE agent_id = $1",
      [agent_id]
    );

    const historyResult = await query(
      auth.user.role,
      `SELECT score_id, score_value, computed_at 
       FROM risk_scores 
       WHERE agent_id = $1 
       ORDER BY computed_at DESC 
       LIMIT 10`,
      [agent_id]
    );

    return NextResponse.json({
      agent: agentResult.rows[0],
      computed_score: scoreValue,
      calculation_window: "30 days",
      history: historyResult.rows,
    });
  } catch (error: any) {
    console.error("[API ERROR: /api/risk/compute POST]", error.message);
    if (error.message?.includes("does not exist in registry")) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to execute compute_risk_score stored function" },
      { status: 500 }
    );
  }
}
