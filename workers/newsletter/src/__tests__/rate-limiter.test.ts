import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '../lib/rate-limiter';

// Mock KVNamespace
class MockKVNamespace {
  private store = new Map<string, { value: string; expiration: number }>();
  private currentTime = Date.now();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiration && item.expiration < this.currentTime) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    const expiration = options?.expirationTtl
      ? this.currentTime + options.expirationTtl * 1000
      : 0;
    this.store.set(key, { value, expiration });
  }

  // Test helper: advance time
  advanceTime(seconds: number): void {
    this.currentTime += seconds * 1000;
  }

  // Test helper: reset
  reset(): void {
    this.store.clear();
    this.currentTime = Date.now();
  }
}

describe('Rate Limiter', () => {
  let kv: MockKVNamespace;
  const testIp = '192.168.1.1';

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1 = 4
    });

    it('should allow requests within limit', async () => {
      const limit = 5;

      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        const result = await checkRateLimit(
          kv as unknown as KVNamespace,
          testIp,
          limit
        );
        expect(result.allowed).toBe(true);
      }

      // 5th request should still be allowed
      const result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp,
        limit
      );
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 5 - 5 = 0
    });

    it('should block request when limit is exceeded', async () => {
      const limit = 5;

      // Make 5 requests (exhaust limit)
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(kv as unknown as KVNamespace, testIp, limit);
      }

      // 6th request should be blocked
      const result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp,
        limit
      );
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track remaining count correctly', async () => {
      const limit = 3;

      // 1st request
      let result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp,
        limit
      );
      expect(result.remaining).toBe(2);

      // 2nd request
      result = await checkRateLimit(kv as unknown as KVNamespace, testIp, limit);
      expect(result.remaining).toBe(1);

      // 3rd request
      result = await checkRateLimit(kv as unknown as KVNamespace, testIp, limit);
      expect(result.remaining).toBe(0);

      // 4th request (blocked)
      result = await checkRateLimit(kv as unknown as KVNamespace, testIp, limit);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset counter after TTL expires', async () => {
      const limit = 5;
      const windowSeconds = 600;

      // Make 5 requests (exhaust limit)
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(
          kv as unknown as KVNamespace,
          testIp,
          limit,
          windowSeconds
        );
      }

      // Verify limit is reached
      let result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp,
        limit,
        windowSeconds
      );
      expect(result.allowed).toBe(false);

      // Advance time past TTL
      kv.advanceTime(windowSeconds + 1);

      // Should allow request again
      result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp,
        limit,
        windowSeconds
      );
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // Reset to limit - 1
    });

    it('should use default limit (5) and window (600s) when not specified', async () => {
      // Make 5 requests with defaults
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(
          kv as unknown as KVNamespace,
          testIp
        );
        expect(result.allowed).toBe(true);
      }

      // 6th request should be blocked
      const result = await checkRateLimit(
        kv as unknown as KVNamespace,
        testIp
      );
      expect(result.allowed).toBe(false);
    });

    it('should isolate rate limits by IP address', async () => {
      const limit = 2;
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Exhaust limit for ip1
      await checkRateLimit(kv as unknown as KVNamespace, ip1, limit);
      await checkRateLimit(kv as unknown as KVNamespace, ip1, limit);

      // ip1 should be blocked
      let result = await checkRateLimit(
        kv as unknown as KVNamespace,
        ip1,
        limit
      );
      expect(result.allowed).toBe(false);

      // ip2 should still be allowed
      result = await checkRateLimit(kv as unknown as KVNamespace, ip2, limit);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should use correct KV key pattern', async () => {
      const kvSpy = vi.spyOn(kv, 'get');

      await checkRateLimit(kv as unknown as KVNamespace, testIp);

      expect(kvSpy).toHaveBeenCalledWith(`rate:subscribe:${testIp}`);
    });
  });
});
