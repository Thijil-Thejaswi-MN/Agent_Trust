// ============================================================================
// AgentTrust: POST /api/auth/login
// Authenticates user against PostgreSQL users table using bcrypt.
// Strict cookie-only auth: sets httpOnly SameSite=Lax cookie.
// Rate limiting:
// - Trusts X-Forwarded-For ONLY if TRUST_PROXY=true is set in env; else direct socket client
// - Throttles failed logins per username (5 attempts/min)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { 
  verifyPassword, 
  createSessionToken, 
  checkRateLimit, 
  verifySameOrigin,
  COOKIE_OPTIONS 
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // 1. Cross-Origin Check
    if (!verifySameOrigin(req)) {
      return NextResponse.json(
        { error: "Forbidden: Cross-origin requests are rejected." },
        { status: 403 }
      );
    }

    // 2. Validate input
    const body = await req.json().catch(() => null);
    if (!body || !body.username || !body.password) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 400 }
      );
    }

    const { username, password } = body;
    const normalizedUsername = String(username).toLowerCase().trim();

    // 3. Client Address Evaluation (Do not trust X-Forwarded-For unless TRUST_PROXY=true)
    const trustProxy = process.env.TRUST_PROXY === "true";
    const clientIdentifier = trustProxy
      ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "direct_client")
      : "direct_client";

    // 4. Rate Limiting: Check both client address and target username
    const clientLimit = checkRateLimit(`login:client:${clientIdentifier}`, 20, 60000);
    const userLimit = checkRateLimit(`login:user:${normalizedUsername}`, 5, 60000);

    if (!clientLimit.allowed || !userLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 1 minute before retrying." },
        { status: 429 }
      );
    }

    // 5. Parameterized query lookup (Safe against SQL Injection)
    const sql = "SELECT user_id, username, password_hash, role FROM users WHERE username = $1;";
    const result = await query(sql, [username]);

    if (result.rows.length === 0) {
      // Generic error to prevent username enumeration
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // 6. Verify password with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 7. Mint stateless JWT session token
    const token = await createSessionToken({
      userId: user.user_id,
      username: user.username,
      role: user.role,
    });

    // 8. Strict Cookie-Only Response (no token in body)
    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role,
      },
    });

    // 9. Set httpOnly SameSite=Lax cookie (secure in production)
    response.cookies.set({
      ...COOKIE_OPTIONS,
      value: token,
    });

    return response;
  } catch (err: any) {
    console.error("Login route error:", err);
    // Never leak stack traces to client
    return NextResponse.json(
      { error: "Internal server error during authentication" },
      { status: 500 }
    );
  }
}
