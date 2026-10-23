// ============================================================================
// AgentTrust: MongoDB Interaction Logs API Route
// GET: Paginated unstructured and polymorphic interaction logs from MongoDB
// Access: admin, auditor
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMongoDb } from "@/lib/db/mongo";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const agentId = searchParams.get("agent_id");
    const interactionId = searchParams.get("interaction_id");

    const filter: Record<string, any> = {};
    if (agentId) {
      filter.agent_id = agentId;
    }
    if (interactionId) {
      filter.interaction_id = interactionId;
    }

    const db = await getMongoDb();
    const collection = db.collection("interaction_logs");

    const totalCount = await collection.countDocuments(filter);
    const skip = (page - 1) * limit;

    const logs = await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs GET]", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve interaction logs from MongoDB" },
      { status: 500 }
    );
  }
}
