// ============================================================================
// AgentTrust: Authentication & Role-Based Authorization Module
// Stateless JWT issuance via 'jose', bcrypt hashing, and Route Handler role gating.
// Enforces:
// 1. httpOnly SameSite=Lax cookie storage.
// 2. Generic authentication errors (no username enumeration).
// 3. In-memory IP/Identifier rate limiting for auth endpoints.
// 4. Centralized requireRole() helper used in every Route Handler.
// ============================================================================

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing required JWT_SECRET environment variable in .env.local");
}

const secretKey = new TextEncoder().encode(JWT_SECRET);
export const COOKIE_NAME = "agenttrust_token";

export interface UserSession {
  userId: string;
  username: string;
  role: "admin" | "auditor";
}

// ----------------------------------------------------------------------------
// Rate Limiter (In-Memory sliding window)
// ----------------------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: maxAttempts - record.count };
}

// ----------------------------------------------------------------------------
// Password Verification
// ----------------------------------------------------------------------------
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ----------------------------------------------------------------------------
// JWT Minting & Verification
// ----------------------------------------------------------------------------
export async function createSessionToken(user: UserSession): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as "admin" | "auditor",
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Session Inspection from Request
// ----------------------------------------------------------------------------
export async function getSession(req?: Request): Promise<UserSession | null> {
  let token: string | undefined;

  // 1. Try reading Authorization: Bearer <token>
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  // 2. Try reading from httpOnly cookie
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // Fallback if accessed in edge/non-standard contexts
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

// ----------------------------------------------------------------------------
// Centralized Route Handler Role Gating Helper
// Every Route Handler calls this function to enforce authentication and RBAC.
// ----------------------------------------------------------------------------
export async function requireRole(
  req: Request,
  allowedRoles: ("admin" | "auditor")[]
): Promise<{ user: UserSession; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const user = await getSession(req);

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Authentication required. Please log in." },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      errorResponse: NextResponse.json(
        { error: `Forbidden: Access requires [${allowedRoles.join(", ")}] role.` },
        { status: 403 }
      ),
    };
  }

  return { user };
}
