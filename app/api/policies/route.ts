// ============================================================================
// AgentTrust: /api/policies
// GET: List all governance policies (admin, auditor)
// POST: Create a new governance rule (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { requireRole } from "@/lib/auth";

const ALLOWED_RULE_TYPES = [
  "latency_d2b",
  "latency_d2d",
  "latency_d2rev",
  "protocol_security",
  "cert_integrity",
];

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const sql = `
      SELECT 
        p.policy_id,
        p.name,
        p.rule_type,
        p.threshold,
        p.created_at,
        u.username AS created_by_username
      FROM policies p
      LEFT JOIN users u ON p.created_by = u.user_id
      ORDER BY p.created_at DESC;
    `;
    const result = await query(sql);
    return NextResponse.json({ policies: result.rows, count: result.rowCount });
  } catch (err: any) {
    console.error("Policies GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve policies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Admin strictly enforced
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.name || !body.rule_type || body.threshold === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: name, rule_type, threshold" },
        { status: 400 }
      );
    }

    const { name, rule_type, threshold } = body;

    if (!ALLOWED_RULE_TYPES.includes(rule_type)) {
      return NextResponse.json(
        {
          error: `Invalid rule_type '${rule_type}'. Allowed types: ${ALLOWED_RULE_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const numThreshold = parseFloat(threshold);
    if (isNaN(numThreshold) || numThreshold <= 0) {
      return NextResponse.json(
        { error: "Invalid threshold: must be a positive numeric value greater than zero" },
        { status: 400 }
      );
    }

    const sql = `
      INSERT INTO policies (name, rule_type, threshold, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await query(sql, [name.trim(), rule_type, numThreshold, auth.user.userId]);
    return NextResponse.json({ success: true, policy: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "Conflict: A policy with this name already exists in the governance catalog." },
        { status: 409 }
      );
    }
    console.error("Policies POST error:", err);
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
