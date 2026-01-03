import type { Env } from '../types';
import * as jose from 'jose';

/**
 * Admin user from session (shared with premium worker via D1)
 */
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'admin' | 'subscriber';
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * Uses constant-time comparison to avoid leaking information about the key
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to maintain constant time even on length mismatch
    // Use dummy comparison to prevent early return optimization
    const dummy = 'x'.repeat(Math.max(a.length, b.length));
    timingSafeCompare(dummy, dummy);
    return false;
  }
  return timingSafeCompare(a, b);
}

function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Check API key authorization
 */
function isApiKeyAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return false;
  }

  // Expect: Bearer <api_key>
  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return false;
  }

  const expectedKey = env.ADMIN_API_KEY;

  if (!expectedKey) {
    return false;
  }

  return timingSafeEqual(token, expectedKey);
}

/**
 * Parse cookie value by name
 */
function parseCookie(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  return null;
}

/**
 * Get user from session token (shared D1 database with premium worker)
 */
async function getUserFromSession(db: D1Database, token: string): Promise<AdminUser | null> {
  const now = Math.floor(Date.now() / 1000);

  const result = await db.prepare(`
    SELECT u.id, u.email, u.name, u.role
    FROM admin_sessions s
    JOIN admin_users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).bind(token, now).first<AdminUser>();

  return result || null;
}

/**
 * Check if user has admin role (owner or admin)
 */
function hasAdminRole(user: AdminUser): boolean {
  return user.role === 'owner' || user.role === 'admin';
}

/**
 * CF Access configuration
 */
const CF_ACCESS_TEAM_DOMAIN = 'kuma8088';
const CF_ACCESS_CERTS_URL = `https://${CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`;

// Cache for JWKS to avoid fetching on every request
let cachedJWKS: jose.JWTVerifyGetKey | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get CF Access JWKS (cached)
 */
async function getCFAccessJWKS(): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  if (cachedJWKS && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return cachedJWKS;
  }

  cachedJWKS = jose.createRemoteJWKSet(new URL(CF_ACCESS_CERTS_URL));
  jwksCacheTime = now;
  return cachedJWKS;
}

/**
 * Validate CF Access JWT and return email if valid
 */
async function validateCFAccessJWT(request: Request): Promise<string | null> {
  // Try Cf-Access-Jwt-Assertion header first (recommended)
  let token = request.headers.get('Cf-Access-Jwt-Assertion');

  // Fallback to CF_Authorization cookie for browser requests
  if (!token) {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      token = parseCookie(cookieHeader, 'CF_Authorization');
    }
  }

  if (!token) {
    return null;
  }

  try {
    const JWKS = await getCFAccessJWKS();
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `https://${CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`,
      audience: CF_ACCESS_TEAM_DOMAIN,
    });

    // Return email from JWT payload
    return (payload.email as string) || null;
  } catch (error) {
    // JWT validation failed - could be expired, invalid signature, etc.
    console.error('CF Access JWT validation failed:', error);
    return null;
  }
}

/**
 * Check if email is an authorized admin
 * For now, we trust CF Access to only allow configured users
 * In the future, we could check against admin_users table
 */
function isAuthorizedAdmin(email: string): boolean {
  // CF Access policy is configured to only allow specific Google accounts
  // If they passed CF Access, they are authorized admins
  return !!email;
}

/**
 * Check authorization - supports API key, session cookie, and CF Access JWT
 *
 * Priority:
 * 1. API key (system-to-system, backwards compatible)
 * 2. CF Access JWT (admin users via Cloudflare Access + Google OAuth)
 * 3. Session cookie (admin users via Magic Link + TOTP)
 */
export async function isAuthorizedAsync(request: Request, env: Env): Promise<boolean> {
  // Check API key first (highest priority for backwards compatibility)
  if (isApiKeyAuthorized(request, env)) {
    return true;
  }

  // Check CF Access JWT (for admin pages protected by Cloudflare Access)
  const cfAccessEmail = await validateCFAccessJWT(request);
  if (cfAccessEmail && isAuthorizedAdmin(cfAccessEmail)) {
    return true;
  }

  // Check session cookie (for Magic Link + TOTP authentication)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const sessionToken = parseCookie(cookieHeader, 'session');
    if (sessionToken) {
      const user = await getUserFromSession(env.DB, sessionToken);
      if (user && hasAdminRole(user)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Legacy synchronous API key check (for backwards compatibility)
 * @deprecated Use isAuthorizedAsync for new code
 */
export function isAuthorized(request: Request, env: Env): boolean {
  return isApiKeyAuthorized(request, env);
}
