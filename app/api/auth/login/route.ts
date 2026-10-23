// ============================================================================
// AgentTrust: POST /api/auth/login
// Authenticates user against PostgreSQL users table using bcrypt.
// Sets stateless httpOnly JWT session cookie with rate-limiting.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { verifyPassword, createSessionToken, checkRateLimit, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting (10 attempts per minute)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local_client";
    const { allowed, remaining } = checkRateLimit(`login:${ip}`, 10, 60000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 1 minute before retrying." },
        { status: 429 }
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

    // 3. Parameterized query lookup (Safe against SQL Injection)
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

    // 4. Verify password with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 5. Mint stateless JWT session token
    const token = await createSessionToken({
      userId: user.user_id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role,
      },
      token, // Also returned for bearer auth in automated tests
    });

    // 6. Set httpOnly SameSite=Lax cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 3600, // 8 hours
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
