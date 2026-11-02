// ============================================================================
// AgentTrust: MongoDB Log Annotations API Route (NoSQL CRUD)
// GET: Read annotations (admin, auditor)
// POST: Create annotation (admin only)
// PATCH: Update annotation note (admin only)
// DELETE: Delete annotation (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMongoDb } from "@/lib/db/mongo";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "auditor"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const interactionId = searchParams.get("interaction_id");
    const annotationId = searchParams.get("annotation_id");

    const filter: Record<string, any> = {};
    if (interactionId) filter.interaction_id = interactionId;
    if (annotationId) filter.annotation_id = annotationId;

    const db = await getMongoDb();
    const annotations = await db
      .collection("log_annotations")
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json({ annotations });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/annotations GET]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch annotations from MongoDB" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const { interaction_id, note } = body;

    if (!interaction_id || typeof interaction_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: interaction_id" },
        { status: 400 }
      );
    }

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json(
        { error: "Parameter 'note' must be a non-empty string." },
        { status: 400 }
      );
    }

    const annotation = {
      annotation_id: crypto.randomUUID(),
      interaction_id,
      author: auth.user.username,
      note: note.trim(),
      created_at: new Date(),
    };

    const db = await getMongoDb();
    await db.collection("log_annotations").insertOne(annotation);

    return NextResponse.json({ success: true, annotation }, { status: 201 });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/annotations POST]", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to create annotation" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const { annotation_id, note } = body;

    if (!annotation_id || typeof annotation_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: annotation_id" },
        { status: 400 }
      );
    }

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json(
        { error: "Parameter 'note' must be a non-empty string." },
        { status: 400 }
      );
    }

    const db = await getMongoDb();
    const result = await db.collection("log_annotations").updateOne(
      { annotation_id },
      { $set: { note: note.trim(), updated_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Annotation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, annotation_id, note: note.trim() });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/annotations PATCH]", error.message);
    return NextResponse.json({ error: error.message || "Failed to update annotation" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    let annotationId = searchParams.get("annotation_id");

    if (!annotationId) {
      const body = await req.json().catch(() => ({}));
      annotationId = body.annotation_id;
    }

    if (!annotationId) {
      return NextResponse.json(
        { error: "Missing required parameter: annotation_id" },
        { status: 400 }
      );
    }

    const db = await getMongoDb();
    const result = await db.collection("log_annotations").deleteOne({ annotation_id: annotationId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Annotation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    console.error("[API ERROR: /api/logs/annotations DELETE]", error.message);
    return NextResponse.json({ error: "Failed to delete annotation" }, { status: 500 });
  }
}

