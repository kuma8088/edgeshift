import type { Env } from '../types';

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

export function isAuthorized(request: Request, env: Env): boolean {
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
