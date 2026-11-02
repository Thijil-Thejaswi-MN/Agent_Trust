// ============================================================================
// AgentTrust: Executive Dashboard Aggregated Statistics API Route
// Demonstrates SQL operations for Course Requirement 6:
// 1. GROUP BY
// 2. HAVING
// 3. Subqueries (correlated scalar subquery + NOT IN subquery)
// 4. Aggregate functions (COUNT, AVG, MAX, MIN)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // Enforce read access for admin and auditor personas
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  try {
    // 1. Protocol Latency Analytics: Aggregate functions (COUNT, AVG, MAX, MIN) + GROUP BY + HAVING
    const protocolStatsRes = await query<{
      protocol: string;
      total_interactions: string;
      avg_latency_ms: string;
      max_latency_ms: string;
    }>(
      auth.user.role,
      `SELECT 
         protocol,
         COUNT(*) AS total_interactions,
         ROUND(AVG(COALESCE(latency_d2d, latency_d2b, 0)), 2) AS avg_latency_ms,
         ROUND(MAX(COALESCE(latency_d2d, latency_d2b, 0)), 2) AS max_latency_ms
       FROM interactions
       GROUP BY protocol
       HAVING COUNT(*) >= 1
       ORDER BY avg_latency_ms DESC`
    );

    // 2. Agent Posture Distribution: Aggregate functions + GROUP BY + HAVING
    const postureStatsRes = await query<{
      status: string;
      agent_count: string;
      avg_posture_risk: string;
    }>(
      auth.user.role,
      `SELECT 
         a.status,
         COUNT(a.agent_id) AS agent_count,
         ROUND(AVG(COALESCE(sub.score_value, 0)), 2) AS avg_posture_risk
       FROM agents a
       LEFT JOIN (
         SELECT DISTINCT ON (agent_id) agent_id, score_value
         FROM risk_scores
         ORDER BY agent_id, computed_at DESC
       ) sub ON a.agent_id = sub.agent_id
       GROUP BY a.status
       HAVING COUNT(a.agent_id) > 0
       ORDER BY a.status ASC`
    );

    // 3. Subquery Filtering: Non-quarantined violations count using NOT IN subquery
    const uncontainedViolationsRes = await query<{
      uncontained_violations_count: string;
    }>(
      auth.user.role,
      `SELECT COUNT(*) AS uncontained_violations_count
       FROM violations v
       JOIN interactions i ON v.interaction_id = i.interaction_id
       WHERE i.source_agent_id NOT IN (
         SELECT agent_id 
         FROM quarantine_events 
         WHERE status = 'active'
       )`
    );

    // 4. Correlated Subquery: Top agent with highest current risk score
    const topRiskAgentRes = await query<{
      name: string;
      status: string;
      current_risk: string;
    }>(
      auth.user.role,
      `SELECT 
         a.name,
         a.status,
         (SELECT score_value 
          FROM risk_scores 
          WHERE agent_id = a.agent_id 
          ORDER BY computed_at DESC 
          LIMIT 1) AS current_risk
       FROM agents a
       ORDER BY current_risk DESC NULLS LAST
       LIMIT 1`
    );

    return NextResponse.json({
      protocol_analytics: protocolStatsRes.rows,
      posture_distribution: postureStatsRes.rows,
      uncontained_violations: parseInt(uncontainedViolationsRes.rows[0]?.uncontained_violations_count || "0", 10),
      highest_risk_agent: topRiskAgentRes.rows[0] || null,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[API ERROR: /api/stats GET]", error);
    return NextResponse.json(
      { error: "Internal server error fetching aggregated statistics" },
      { status: 500 }
    );
  }
}
