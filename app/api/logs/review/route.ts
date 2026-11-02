// ============================================================================
// AgentTrust: MongoDB Interaction Log Review API Route
// PATCH: Admin marks a log reviewed with updateOne + $set { review: ... }
// Access: admin only (auditor gets 403 Forbidden)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMongoDb } from "@/lib/db/mongo";

const VALID_STATUSES = ["approved", "flagged", "dismissed"] as const;

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const { interaction_id, status, note } = body;

    if (!interaction_id || typeof interaction_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: interaction_id" },
        { status: 400 }
      );
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid review status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const review = {
      status,
      reviewed_by: auth.user.username,
      reviewed_at: new Date(),
      note: typeof note === "string" ? note.trim() : "",
    };

    const db = await getMongoDb();
    const result = await db.collection("interaction_logs").updateOne(
      { interaction_id },
      { $set: { review } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: `Interaction log not found for interaction_id: ${interaction_id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, interaction_id, review });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/review PATCH]", error.message);
    return NextResponse.json(
      { error: "Failed to update review status in MongoDB" },
      { status: 500 }
    );
  }
}

