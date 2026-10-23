// ============================================================================
// AgentTrust: Authentication & Role-Based Authorization Module
// Cookie-only stateless JWT issuance via 'jose', bcrypt hashing, and Route Handler role gating.
// Enforces:
// 1. Strict cookie-only authentication (Bearer tokens rejected).
// 2. httpOnly SameSite=Lax cookie storage with secure flag in production.
// 3. Mandatory JWT_SECRET validation (no fallbacks, minimum 32 chars).
// 4. Same-origin protection for mutating HTTP methods (POST/PUT/DELETE/PATCH).
// 5. Generic authentication errors (no username enumeration).
// 6. Sliding-window IP rate limiting for auth endpoints.
// ============================================================================

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// ----------------------------------------------------------------------------
// Secret Validation: Strict environment enforcement, >= 32 characters
// ----------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insecure. " +
    "It must be defined in .env.local and contain at least 32 characters."
  );
}

const secretKey = new TextEncoder().encode(JWT_SECRET);
export const COOKIE_NAME = "agenttrust_token";

export const COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 8 * 60 * 60, // 8 hours
};

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
  maxAttempts: number = 10,
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
// Cookie Parsing Helper (Supports both next/headers and raw Request Cookie header)
// ----------------------------------------------------------------------------
function parseCookieHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return undefined;
}

// ----------------------------------------------------------------------------
// Cookie-Only Session Inspection
// Strict: Does NOT inspect or accept Authorization: Bearer headers!
// ----------------------------------------------------------------------------
export async function getSession(req?: Request): Promise<UserSession | null> {
  let token: string | undefined;

  // 1. Try reading from Request Cookie header directly
  if (req) {
    const cookieHeader = req.headers.get("cookie");
    token = parseCookieHeader(cookieHeader, COOKIE_NAME);
  }

  // 2. Try reading from next/headers cookies()
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // In route handlers or non-cookie contexts
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

// ----------------------------------------------------------------------------
// Cross-Origin Mutating Request Validation
// ----------------------------------------------------------------------------
export function verifySameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Direct non-browser requests or same-origin without Origin header

  const host = req.headers.get("host");
  if (!host) return false;

  try {
    const originUrl = new URL(origin);
    // Origin host must match Host header
    return originUrl.host === host;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Centralized Route Handler Role Gating Helper
// ----------------------------------------------------------------------------
export async function requireRole(
  req: Request,
  allowedRoles: ("admin" | "auditor")[]
): Promise<{ user: UserSession; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  // Reject cross-origin mutating requests
  const method = req.method.toUpperCase();
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    if (!verifySameOrigin(req)) {
      return {
        errorResponse: NextResponse.json(
          { error: "Forbidden: Cross-origin requests are rejected." },
          { status: 403 }
        ),
      };
    }
  }

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
