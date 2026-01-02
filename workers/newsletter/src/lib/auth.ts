import type { Env } from '../types';

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
 * Check authorization - supports both API key and session cookie
 *
 * Priority:
 * 1. API key (system-to-system, backwards compatible)
 * 2. Session cookie (admin users via Magic Link + TOTP)
 */
export async function isAuthorizedAsync(request: Request, env: Env): Promise<boolean> {
  // Check API key first (highest priority for backwards compatibility)
  if (isApiKeyAuthorized(request, env)) {
    return true;
  }

  // Check session cookie
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
