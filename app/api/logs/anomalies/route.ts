// ============================================================================
// AgentTrust: MongoDB Anomaly Aggregation Pipeline Route
// GET: Aggregates polymorphic logs across agents to detect payload/header anomalies
// Access: admin, auditor
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMongoDb } from "@/lib/db/mongo";
import { query } from "@/lib/db/pg";

export const anomalyAggregationPipeline = [
  {
    $project: {
      agent_id: 1,
      interaction_id: 1,
      timestamp: 1,
      headers: 1,
      raw_payload: 1,
      has_bypass_header: {
        $cond: [{ $ifNull: ["$headers.x-bypass-governance", false] }, 1, 0],
      },
      has_large_payload: {
        $cond: [
          {
            $or: [
              { $gt: [{ $ifNull: ["$raw_payload.anomalous_payload_bytes", 0] }, 50000] },
              { $gt: [{ $ifNull: ["$raw_payload.payload_bytes", 0] }, 50000] },
            ],
          },
          1,
          0,
        ],
      },
      has_suspicious_command: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$raw_payload.suspicious_commands", []] } }, 0] },
          1,
          0,
        ],
      },
      has_error: {
        $cond: [{ $ifNull: ["$raw_payload.error", false] }, 1, 0],
      },
    },
  },
  {
    $group: {
      _id: "$agent_id",
      total_interactions: { $sum: 1 },
      bypass_attempts: { $sum: "$has_bypass_header" },
      large_payload_events: { $sum: "$has_large_payload" },
      suspicious_commands_detected: { $sum: "$has_suspicious_command" },
      error_events: { $sum: "$has_error" },
      sample_interaction_ids: { $push: "$interaction_id" },
      latest_event_time: { $max: "$timestamp" },
    },
  },
  {
    $project: {
      agent_id: "$_id",
      total_interactions: 1,
      bypass_attempts: 1,
      large_payload_events: 1,
      suspicious_commands_detected: 1,
      error_events: 1,
      latest_event_time: 1,
      sample_interaction_ids: { $slice: ["$sample_interaction_ids", 3] },
      computed_anomaly_score: {
        $add: [
          { $multiply: ["$suspicious_commands_detected", 40] },
          { $multiply: ["$bypass_attempts", 30] },
          { $multiply: ["$large_payload_events", 20] },
          { $multiply: ["$error_events", 10] },
        ],
      },
    },
  },
  {
    $sort: { computed_anomaly_score: -1, total_interactions: -1 },
  },
];

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const db = await getMongoDb();
    const collection = db.collection("interaction_logs");

    const anomalyResults = await collection
      .aggregate(anomalyAggregationPipeline as any)
      .toArray();

    // Fetch agent metadata from PostgreSQL to enrich results with agent names and current statuses
    const agentRows = await query(
      "SELECT agent_id, name, agent_type, owner_team, status FROM agents"
    );
    const agentMap = new Map<string, any>();
    for (const a of agentRows.rows) {
      agentMap.set(a.agent_id, a);
    }

    const enriched = anomalyResults.map((item) => {
      const meta = agentMap.get(item.agent_id);
      return {
        ...item,
        agent_name: meta?.name || "Unknown Agent",
        agent_type: meta?.agent_type || "unknown",
        owner_team: meta?.owner_team || "unknown",
        agent_status: meta?.status || "unknown",
      };
    });

    return NextResponse.json({
      anomalies: enriched,
      count: enriched.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/anomalies GET]", error.message);
    return NextResponse.json(
      { error: "Failed to execute anomaly aggregation pipeline" },
      { status: 500 }
    );
  }
}
