/**
 * Rate Limiter Library
 *
 * Provides IP-based rate limiting using Cloudflare KV storage.
 * Uses a fixed window counter algorithm with automatic TTL expiration.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Check if a request from the given IP should be rate limited.
 *
 * @param kv - Cloudflare KV namespace for storing rate limit data
 * @param ip - IP address to check
 * @param limit - Maximum number of requests allowed (default: 5)
 * @param windowSeconds - Time window in seconds (default: 600 = 10 minutes)
 * @returns Result indicating if request is allowed and remaining quota
 */
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  limit: number = 5,
  windowSeconds: number = 600
): Promise<RateLimitResult> {
  const key = `rate:subscribe:${ip}`;

  // Get current counter
  const currentValue = await kv.get(key);
  const currentCount = currentValue ? parseInt(currentValue, 10) : 0;

  // Check if limit exceeded
  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  // Increment counter
  const newCount = currentCount + 1;
  await kv.put(key, newCount.toString(), {
    expirationTtl: windowSeconds,
  });

  return {
    allowed: true,
    remaining: limit - newCount,
  };
}
