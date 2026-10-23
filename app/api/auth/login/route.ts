// ============================================================================
// AgentTrust: POST /api/auth/login
// Authenticates user against PostgreSQL users table using bcrypt.
// Strict cookie-only auth: sets httpOnly SameSite=Lax cookie.
// Token is NEVER returned in the JSON response body.
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

    // 2. IP Rate Limiting (10 attempts per minute)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local_client";
    const { allowed, remaining } = checkRateLimit(`login:${ip}`, 10, 60000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 1 minute before retrying." },
        { status: 429 }
      );
    }

    // 3. Validate input
    const body = await req.json().catch(() => null);
    if (!body || !body.username || !body.password) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 400 }
      );
    }

    const { username, password } = body;

    // 4. Parameterized query lookup (Safe against SQL Injection)
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

    // 5. Verify password with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 6. Mint stateless JWT session token
    const token = await createSessionToken({
      userId: user.user_id,
      username: user.username,
      role: user.role,
    });

    // 7. Strict Cookie-Only Response (no token in body)
    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role,
      },
    });

    // 8. Set httpOnly SameSite=Lax cookie (secure in production)
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
