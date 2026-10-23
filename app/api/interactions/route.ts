// ============================================================================
// AgentTrust: /api/interactions
// GET: List interactions with pagination, latency telemetry, and agent names
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;
    const agentId = searchParams.get("agent_id") || "";
    const protocol = searchParams.get("protocol") || "";

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (agentId.trim()) {
      conditions.push(`(i.source_agent_id = $${pIdx} OR i.target_agent_id = $${pIdx})`);
      params.push(agentId.trim());
      pIdx++;
    }

    if (protocol.trim()) {
      conditions.push(`i.protocol ILIKE $${pIdx}`);
      params.push(`%${protocol.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT count(*) FROM interactions i ${whereClause};`;
    const countRes = await query(countSql, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    const dataSql = `
      SELECT 
        i.interaction_id,
        i.protocol,
        i.status,
        i.latency_d2d,
        i.latency_d2b,
        i.latency_d2rev,
        i.initiated_at,
        i.completed_at,
        src.agent_id AS source_agent_id,
        src.name AS source_agent_name,
        tgt.agent_id AS target_agent_id,
        tgt.name AS target_agent_name
      FROM interactions i
      JOIN agents src ON i.source_agent_id = src.agent_id
      JOIN agents tgt ON i.target_agent_id = tgt.agent_id
      ${whereClause}
      ORDER BY i.initiated_at DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1};
    `;
    params.push(limit, offset);

    const dataRes = await query(dataSql, params);

    return NextResponse.json({
      interactions: dataRes.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err: any) {
    console.error("Interactions GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve interactions" }, { status: 500 });
  }
}
