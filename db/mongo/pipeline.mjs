// ============================================================================
// AgentTrust: MongoDB Anomaly Detection Aggregation Pipeline
// Groups interaction_logs by agent_id to detect payload and header anomalies
// Configuration strictly read from environment variables (.env.local)
// ============================================================================

import { MongoClient } from "mongodb";

// Automatically load .env.local if present in Node 20+
try {
  process.loadEnvFile?.(".env.local");
} catch {}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Missing required MONGODB_URI environment variable.");
}
const dbName = process.env.MONGO_DB || "agenttrust";

export const anomalyAggregationPipeline = [
  {
    $project: {
      agent_id: 1,
      interaction_id: 1,
      timestamp: 1,
      headers: 1,
      raw_payload: 1,
      has_bypass_header: {
        $cond: [{ $ifNull: ["$headers.x-bypass-governance", false] }, 1, 0]
      },
      has_large_payload: {
        $cond: [
          {
            $or: [
              { $gt: [{ $ifNull: ["$raw_payload.anomalous_payload_bytes", 0] }, 50000] },
              { $gt: [{ $ifNull: ["$raw_payload.payload_bytes", 0] }, 50000] }
            ]
          },
          1,
          0
        ]
      },
      has_suspicious_command: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$raw_payload.suspicious_commands", []] } }, 0] },
          1,
          0
        ]
      },
      has_error: {
        $cond: [{ $ifNull: ["$raw_payload.error", false] }, 1, 0]
      }
    }
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
      latest_event_time: { $max: "$timestamp" }
    }
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
      // Composite anomaly score: 40*suspicious_commands + 30*bypass + 20*large_payload + 10*errors
      computed_anomaly_score: {
        $add: [
          { $multiply: ["$suspicious_commands_detected", 40] },
          { $multiply: ["$bypass_attempts", 30] },
          { $multiply: ["$large_payload_events", 20] },
          { $multiply: ["$error_events", 10] }
        ]
      }
    }
  },
  {
    $sort: { computed_anomaly_score: -1, total_interactions: -1 }
  }
];

async function runPipeline() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("interaction_logs");

    console.log(">>> Executing Anomaly Detection Aggregation Pipeline on 'interaction_logs'...");
    const cursor = collection.aggregate(anomalyAggregationPipeline);
    const results = await cursor.toArray();

    console.log(">>> Aggregation Pipeline Results (Ranked by Anomaly Score):");
    console.table(
      results.map((r) => ({
        Agent_ID: r.agent_id,
        Total_Logs: r.total_interactions,
        Bypass_Headers: r.bypass_attempts,
        Large_Payloads: r.large_payload_events,
        Suspicious_Cmds: r.suspicious_commands_detected,
        Errors: r.error_events,
        Anomaly_Score: r.computed_anomaly_score
      }))
    );

    return results;
  } finally {
    await client.close();
  }
}

// Allow standalone execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  runPipeline().catch((err) => {
    console.error("Aggregation pipeline failed:", err);
    process.exit(1);
  });
}
