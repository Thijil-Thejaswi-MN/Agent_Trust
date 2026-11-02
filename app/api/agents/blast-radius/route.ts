// ============================================================================
// AgentTrust: GET /api/agents/blast-radius
// Executes the PostgreSQL Recursive CTE query to calculate agent blast radius.
// Access: admin, auditor (Read-Only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent_id");
  const maxDepthParam = searchParams.get("max_depth") || "3";
  const maxDepth = Math.min(10, Math.max(1, parseInt(maxDepthParam, 10) || 3));

  if (!agentId || !UUID_REGEX.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid or missing required agent_id parameter (must be valid UUID)" },
      { status: 400 }
    );
  }

  try {
    const agentRes = await query(
      auth.user.role,
      "SELECT agent_id, name, agent_type, owner_team, status FROM agents WHERE agent_id = $1",
      [agentId]
    );

    if (agentRes.rowCount === 0) {
      return NextResponse.json({ error: "Source agent not found" }, { status: 404 });
    }

    const sql = `
      WITH RECURSIVE blast_radius AS (
          SELECT 
              i.target_agent_id AS agent_id,
              tgt.name AS agent_name,
              tgt.agent_type,
              tgt.owner_team,
              tgt.status,
              1 AS depth,
              ARRAY[i.source_agent_id, i.target_agent_id]::UUID[] AS path_ids,
              ARRAY[src.name, tgt.name]::VARCHAR[] AS path_names,
              i.protocol AS via_protocol,
              i.initiated_at AS interaction_time
          FROM interactions i
          JOIN agents src ON i.source_agent_id = src.agent_id
          JOIN agents tgt ON i.target_agent_id = tgt.agent_id
          WHERE i.source_agent_id = $1

          UNION

          SELECT 
              i.target_agent_id AS agent_id,
              tgt.name AS agent_name,
              tgt.agent_type,
              tgt.owner_team,
              tgt.status,
              br.depth + 1 AS depth,
              br.path_ids || i.target_agent_id AS path_ids,
              br.path_names || tgt.name AS path_names,
              i.protocol AS via_protocol,
              i.initiated_at AS interaction_time
          FROM interactions i
          JOIN blast_radius br ON i.source_agent_id = br.agent_id
          JOIN agents tgt ON i.target_agent_id = tgt.agent_id
          WHERE NOT (i.target_agent_id = ANY(br.path_ids))
            AND br.depth < $2
      )
      SELECT DISTINCT ON (agent_id)
          agent_id,
          agent_name,
          agent_type,
          owner_team,
          status,
          depth,
          path_names,
          via_protocol,
          interaction_time
      FROM blast_radius
      ORDER BY agent_id, depth ASC;
    `;

    const result = await query(auth.user.role, sql, [agentId, maxDepth]);

    return NextResponse.json({
      source_agent: agentRes.rows[0],
      max_depth: maxDepth,
      blast_radius_count: result.rowCount,
      reachable_agents: result.rows,
    });
  } catch (err: any) {
    console.error("Blast radius query error:", err);
    return NextResponse.json({ error: "Failed to compute agent blast radius" }, { status: 500 });
  }
}

