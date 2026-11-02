// ============================================================================
// AgentTrust: /api/violations
// GET: Query enriched violation records from active_violations_view (admin, auditor)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

const ALLOWED_SEVERITIES = ["low", "medium", "high", "critical"];

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const severity = searchParams.get("severity") || "";
    const agentId = searchParams.get("agent_id") || "";
    const isQuarantined = searchParams.get("is_quarantined");

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (severity && ALLOWED_SEVERITIES.includes(severity)) {
      conditions.push(`severity = $${pIdx}`);
      params.push(severity);
      pIdx++;
    }

    if (agentId.trim()) {
      conditions.push(`source_agent_id = $${pIdx}`);
      params.push(agentId.trim());
      pIdx++;
    }

    if (isQuarantined === "true") {
      conditions.push(`is_source_quarantined = true`);
    } else if (isQuarantined === "false") {
      conditions.push(`is_source_quarantined = false`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        violation_id,
        detected_at,
        severity,
        violation_description,
        interaction_id,
        protocol,
        latency_d2d,
        latency_d2b,
        latency_d2rev,
        source_agent_id,
        source_agent_name,
        source_agent_status,
        target_agent_id,
        target_agent_name,
        policy_id,
        policy_name,
        rule_type,
        policy_threshold,
        is_source_quarantined,
        active_quarantine_id,
        source_quarantined_at
      FROM active_violations_view
      ${whereClause}
      ORDER BY detected_at DESC;
    `;

    const result = await query(auth.user.role, sql, params);
    return NextResponse.json({ violations: result.rows, count: result.rowCount });
  } catch (err: any) {
    console.error("Violations GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve violations" }, { status: 500 });
  }
}
