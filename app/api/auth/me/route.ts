// ============================================================================
// AgentTrust: GET /api/auth/me
// Returns current authenticated session details.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }
    return NextResponse.json({ authenticated: true, user });
  } catch (err: any) {
    console.error("Auth me error:", err);
    return NextResponse.json({ error: "Session verification error" }, { status: 500 });
  }
}
