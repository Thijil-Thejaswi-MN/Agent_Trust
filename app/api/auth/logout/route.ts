// ============================================================================
// AgentTrust: POST /api/auth/logout
// Clears authentication session cookie.
// ============================================================================

import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
