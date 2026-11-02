// ============================================================================
// AgentTrust: POST /api/simulate
// Simulates live autonomous agent interactions to demonstrate PostgreSQL triggers:
// 1. evaluate_interaction_policies: Detects SLA breaches & prohibited protocols.
// 2. auto_quarantine_on_critical_violation: Idempotently quarantines source agent.
// 3. Dual-database persistence: Writes to Postgres first, then MongoDB logs.
// Access: admin strictly
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db/pg";
import { getMongoDb } from "@/lib/db/mongo";

export async function POST(req: NextRequest) {
  // Role check: Admin only
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  let body: {
    source_agent_id?: string;
    target_agent_id?: string;
    scenario?: "normal" | "broker_latency_spike" | "reviewer_delay" | "critical_security_breach";
  } = {};

  try {
    body = await req.json();
  } catch {
    // If no body provided, default to critical breach to demonstrate trigger cascade
  }

  const scenario = body.scenario || "critical_security_breach";

  try {
    // 1. Fetch available agents if not explicitly passed
    let sourceId = body.source_agent_id;
    let targetId = body.target_agent_id;

    if (!sourceId || !targetId) {
      const agentsRes = await query(
        auth.user.role,
        "SELECT agent_id, name, status FROM agents WHERE status = 'active' ORDER BY registered_at ASC LIMIT 5;"
      );
      if ((agentsRes.rowCount ?? 0) < 2) {
        // Fallback to any two distinct agents
        const allAgents = await query(auth.user.role, "SELECT agent_id, name FROM agents LIMIT 2;");
        if ((allAgents.rowCount ?? 0) < 2) {
          return NextResponse.json(
            { error: "Insufficient agents registered to simulate an interaction." },
            { status: 400 }
          );
        }
        sourceId = allAgents.rows[0].agent_id;
        targetId = allAgents.rows[1].agent_id;
      } else {
        sourceId = agentsRes.rows[0].agent_id;
        targetId = agentsRes.rows[1].agent_id;
      }
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "Source and target agents must be distinct." },
        { status: 400 }
      );
    }

    // 2. Prepare scenario parameters
    let protocol = "A2A/2.0-Secure";
    let status = "success";
    let latencyD2D = 120.5;
    let latencyD2B = 45.0;
    let latencyD2Rev = 80.0;
    let payloadAnomaly = false;
    let bypassHeader = false;

    if (scenario === "broker_latency_spike") {
      latencyD2B = 340.0; // SLA threshold is 250ms -> fires High violation
      protocol = "A2A/1.9-gRPC";
    } else if (scenario === "reviewer_delay") {
      latencyD2Rev = 720.0; // SLA threshold is 600ms -> fires Medium violation
      protocol = "A2A/2.0-Secure";
    } else if (scenario === "critical_security_breach") {
      protocol = "A2A/1.0-Legacy-Unencrypted"; // Prohibited protocol -> fires Critical violation & auto-quarantine!
      status = "failed";
      payloadAnomaly = true;
      bypassHeader = true;
    }

    // 3. Step 1: Write to PostgreSQL (Triggers fire automatically)
    const interactionSql = `
      INSERT INTO interactions (
        source_agent_id,
        target_agent_id,
        protocol,
        status,
        latency_d2d,
        latency_d2b,
        latency_d2rev,
        initiated_at,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '1 second')
      RETURNING *;
    `;

    const pgResult = await query(auth.user.role, interactionSql, [
      sourceId,
      targetId,
      protocol,
      status,
      latencyD2D,
      latencyD2B,
      latencyD2Rev,
    ]);

    const createdInteraction = pgResult.rows[0];

    // Inspect if trigger wrote any violations for this interaction
    const violationsResult = await query(
      auth.user.role,
      `SELECT v.violation_id, v.severity, v.description, v.detected_at, p.name AS policy_name
       FROM violations v
       JOIN policies p ON v.policy_id = p.policy_id
       WHERE v.interaction_id = $1`,
      [createdInteraction.interaction_id]
    );

    // Inspect updated status of source agent
    const agentStatusResult = await query(
      auth.user.role,
      "SELECT agent_id, name, status FROM agents WHERE agent_id = $1",
      [sourceId]
    );

    // 4. Step 2: Write polymorphic unstructured document to MongoDB
    let mongoLogInserted = false;
    try {
      const db = await getMongoDb();
      const logsCollection = db.collection("interaction_logs");

      const mongoDoc = {
        interaction_id: createdInteraction.interaction_id,
        agent_id: sourceId,
        timestamp: new Date(),
        headers: {
          "content-type": "application/json",
          "x-agent-signature": `SIG-${Date.now()}`,
          ...(bypassHeader ? { "x-bypass-governance": "true" } : {}),
        },
        raw_payload: {
          simulation_scenario: scenario,
          protocol_used: protocol,
          latency_metrics: {
            d2d_ms: latencyD2D,
            d2b_ms: latencyD2B,
            d2rev_ms: latencyD2Rev,
          },
          ...(payloadAnomaly
            ? {
                anomalous_payload_bytes: 84200,
                suspicious_commands: ["DROP_CONSTRAINTS", "EXEC_RAW_BYTECODE"],
                error: "SECURITY_BREACH_DETECTED",
              }
            : {
                payload_bytes: 1420,
                message: "Standard autonomous consensus payload",
              }),
        },
      };

      await logsCollection.insertOne(mongoDoc);
      mongoLogInserted = true;
    } catch (mongoErr: any) {
      console.error("[SIMULATE PARTIAL FAILURE: Mongo Write Failed]", mongoErr);
      // Return clear partial failure response as required
      return NextResponse.json(
        {
          error: "Partial Failure: PostgreSQL interaction was committed and triggers executed, but MongoDB log write failed.",
          partial_failure: true,
          postgres_interaction_id: createdInteraction.interaction_id,
          violations_detected: violationsResult.rows,
          source_agent: agentStatusResult.rows[0],
        },
        { status: 207 } // 207 Multi-Status
      );
    }

    // 5. Successful dual-write response with trigger cascade proof
    return NextResponse.json({
      success: true,
      scenario,
      interaction: createdInteraction,
      violations_detected: violationsResult.rows,
      source_agent: agentStatusResult.rows[0],
      mongo_log_synced: mongoLogInserted,
      trigger_cascade_executed: violationsResult.rows.some((v: any) => v.severity === "critical"),
    });
  } catch (err: any) {
    console.error("[API ERROR: /api/simulate POST]", err);
    return NextResponse.json(
      { error: "Failed to simulate agent interaction" },
      { status: 500 }
    );
  }
}
