// ============================================================================
// AgentTrust: Manual Quarantine / Release Action Route
// POST: Transitions agent status and updates quarantine_events atomically
// Enforces:
// 1. Transactional isolation (BEGIN / COMMIT / ROLLBACK)
// 2. Pessimistic row locking (SELECT ... FOR UPDATE) to prevent race conditions
// 3. Strict RBAC (admin only)
// 4. Input sanitization (UUID regex check)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getClient } from "@/lib/db/pg";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuarantineActionBody {
  agent_id: string;
  action: "quarantine" | "release";
  reason?: string;
}

export async function POST(req: NextRequest) {
  // 1. RBAC Check: Administrative actions require admin privileges
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  let body: QuarantineActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { agent_id, action, reason } = body;

  if (!agent_id || !action || !["quarantine", "release"].includes(action)) {
    return NextResponse.json(
      { error: "Missing required fields: agent_id (UUID) and action ('quarantine' | 'release')" },
      { status: 400 }
    );
  }

  if (!UUID_REGEX.test(agent_id)) {
    return NextResponse.json(
      { error: "Invalid agent_id: Must be a valid UUID format" },
      { status: 400 }
    );
  }

  // 2. Acquire dedicated database client for explicit transaction
  const client = await getClient(auth.user.role);

  try {
    await client.query("BEGIN");

    // 3. Acquire pessimistic row lock on the target agent to prevent concurrent mutations
    const agentCheck = await client.query(
      `SELECT agent_id, name, agent_type, owner_team, status 
       FROM agents 
       WHERE agent_id = $1 
       FOR UPDATE`,
      [agent_id]
    );

    if (agentCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Target agent not found" }, { status: 404 });
    }

    const currentAgent = agentCheck.rows[0];

    if (action === "quarantine") {
      // Check if already in quarantined state
      if (currentAgent.status === "quarantined") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Agent '${currentAgent.name}' is already quarantined` },
          { status: 409 }
        );
      }

      // Update agent status to quarantined
      await client.query(
        `UPDATE agents SET status = 'quarantined' WHERE agent_id = $1`,
        [agent_id]
      );

      // Insert active quarantine audit event
      const qResult = await client.query(
        `INSERT INTO quarantine_events (agent_id, violation_id, status, quarantined_at)
         VALUES ($1, NULL, 'active', NOW())
         RETURNING quarantine_id, agent_id, status, quarantined_at`,
        [agent_id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        message: `Agent '${currentAgent.name}' successfully placed in quarantine`,
        action: "quarantine",
        agent_id,
        quarantine_event: qResult.rows[0],
        reason: reason || "Manual administrator containment action",
      });
    } else {
      // action === 'release'
      if (currentAgent.status !== "quarantined") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Cannot release agent '${currentAgent.name}': status is '${currentAgent.status}', not 'quarantined'` },
          { status: 400 }
        );
      }

      // Transition agent back to active
      await client.query(
        `UPDATE agents SET status = 'active' WHERE agent_id = $1`,
        [agent_id]
      );

      // Close the active quarantine event
      const qResult = await client.query(
        `UPDATE quarantine_events 
         SET status = 'released', released_at = NOW() 
         WHERE agent_id = $1 AND status = 'active'
         RETURNING quarantine_id, agent_id, status, quarantined_at, released_at`,
        [agent_id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        message: `Agent '${currentAgent.name}' successfully released from quarantine`,
        action: "release",
        agent_id,
        quarantine_event: qResult.rows[0] || null,
        reason: reason || "Manual administrator release authorization",
      });
    }
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[API ERROR: /api/quarantine/action POST]", error.message);
    return NextResponse.json(
      { error: "Transaction failed while executing quarantine action" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
