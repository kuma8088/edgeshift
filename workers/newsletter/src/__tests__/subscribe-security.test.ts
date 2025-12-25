import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { handleSubscribe } from '../routes/subscribe';

// Mock email sending
vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Turnstile verification
vi.mock('../lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
}));

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

  // Test helper: reset
  reset(): void {
    this.store.clear();
    this.currentTime = Date.now();
  }
}

describe('Subscribe Security Features', () => {
  let mockKV: MockKVNamespace;

  beforeEach(async () => {
    await setupTestDb();
    mockKV = new MockKVNamespace();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
    mockKV.reset();
  });

  describe('Rate Limiting', () => {
    it('should allow first 5 requests from same IP', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      for (let i = 0; i < 5; i++) {
        const response = await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `test${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );

        // Should succeed (200 or 201)
        expect([200, 201]).toContain(response.status);
      }
    });

    it('should block 6th request from same IP with 429 status', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      // Make 5 requests (exhaust limit)
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `test${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      // 6th request should be blocked
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp,
          },
          body: JSON.stringify({
            email: 'test6@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Too many requests. Please try again later.');
    });

    it('should return Retry-After header on 429', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `test${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      // Next request should have Retry-After header
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp,
          },
          body: JSON.stringify({
            email: 'blocked@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('600'); // 10 minutes in seconds
    });

    it('should have independent rate limits per IP', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.200';

      // Exhaust limit for IP1
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': ip1,
            },
            body: JSON.stringify({
              email: `ip1-${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      // IP1 should be blocked
      const blockedResponse = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ip1,
          },
          body: JSON.stringify({
            email: 'ip1-blocked@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );
      expect(blockedResponse.status).toBe(429);

      // IP2 should still be allowed
      const allowedResponse = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ip2,
          },
          body: JSON.stringify({
            email: 'ip2-allowed@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );
      expect([200, 201]).toContain(allowedResponse.status);
    });

    it('should use exact error message from spec', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `test${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp,
          },
          body: JSON.stringify({
            email: 'blocked@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      const data = await response.json();
      expect(data.error).toBe('Too many requests. Please try again later.');
    });

    it('should allow requests when RATE_LIMIT_KV is not configured', async () => {
      const env = {
        ...getTestEnv(),
        // Explicitly omit RATE_LIMIT_KV
      };
      delete (env as any).RATE_LIMIT_KV; // Ensure it's undefined

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test-no-kv@example.com',
            name: 'No KV Test',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      // Should succeed (200 or 201) despite no rate limiting
      expect([200, 201]).toContain(response.status);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Disposable Email Detection', () => {
    it('should reject mailinator.com with 400 status', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@mailinator.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Please use a permanent email address');
    });

    it('should reject tempmail.io with 400 status', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'user@tempmail.io',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Please use a permanent email address');
    });

    it('should accept gmail.com addresses', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@gmail.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect([200, 201]).toContain(response.status);
    });

    it('should accept outlook.com addresses', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'user@outlook.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect([200, 201]).toContain(response.status);
    });

    it('should use exact error message from spec', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@guerrillamail.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      const data = await response.json();
      expect(data.error).toBe('Please use a permanent email address');
    });

    it('should be case-insensitive (MAILINATOR.COM rejected)', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'TEST@MAILINATOR.COM',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Please use a permanent email address');
    });
  });

  describe('Security Processing Order', () => {
    it('should check rate limit before disposable email', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      // Exhaust rate limit with valid emails
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `valid${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      // Next request with disposable email should hit rate limit first
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp,
          },
          body: JSON.stringify({
            email: 'test@mailinator.com', // Disposable email
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      // Should be 429 (rate limit), not 400 (disposable email)
      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Too many requests. Please try again later.');
    });

    it('should check disposable email after rate limit', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      // First request with disposable email (within rate limit)
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@mailinator.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      // Should be 400 (disposable email), not 429 (rate limit)
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Please use a permanent email address');
    });

    it('should check disposable email before database operations', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@10minutemail.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);

      // Verify no subscriber was created in DB
      const subscriber = await env.DB.prepare(
        "SELECT * FROM subscribers WHERE email = 'test@10minutemail.com'"
      ).first();
      expect(subscriber).toBeNull();
    });

    it('should process valid email through all checks to DB', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'valid@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(201);

      // Verify subscriber was created in DB
      const subscriber = await env.DB.prepare(
        "SELECT * FROM subscribers WHERE email = 'valid@example.com'"
      ).first();
      expect(subscriber).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should allow request with null IP (gracefully degrade)', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      // Request without CF-Connecting-IP header
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      // Should succeed (rate limiting skipped for null IP)
      expect([200, 201]).toContain(response.status);
    });

    it('should reject empty email string', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: '',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Email and turnstile token are required');
    });

    it('should reject missing Turnstile token', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            // turnstileToken missing
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Email and turnstile token are required');
    });
  });

  describe('Security Implementation Verification', () => {
    it('should actually call rate limit KV', async () => {
      const kvSpy = vi.spyOn(mockKV, 'get');
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      // Verify KV was actually called
      expect(kvSpy).toHaveBeenCalled();
      expect(kvSpy).toHaveBeenCalledWith('rate:subscribe:192.168.1.1');
    });

    it('should actually check disposable email list', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      // Test with known disposable domain
      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@guerrillamail.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Please use a permanent email address');
    });

    it('should not leak sensitive information in error responses', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };
      const testIp = '192.168.1.100';

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await handleSubscribe(
          new Request('http://localhost/api/newsletter/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': testIp,
            },
            body: JSON.stringify({
              email: `test${i}@example.com`,
              turnstileToken: 'test-token',
            }),
          }),
          env
        );
      }

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp,
          },
          body: JSON.stringify({
            email: 'blocked@example.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      const data = await response.json();

      // Error message should not contain:
      // - IP addresses
      // - Internal implementation details
      // - Stack traces
      // - Database schema info
      expect(data.error).not.toContain(testIp);
      expect(data.error).not.toContain('KV');
      expect(data.error).not.toContain('stack');
      expect(data.error).not.toContain('DB');

      // Should be generic, user-friendly message
      expect(data.error).toBe('Too many requests. Please try again later.');
    });

    it('should not leak information in disposable email errors', async () => {
      const env = {
        ...getTestEnv(),
        RATE_LIMIT_KV: mockKV as unknown as KVNamespace,
      };

      const response = await handleSubscribe(
        new Request('http://localhost/api/newsletter/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({
            email: 'test@mailinator.com',
            turnstileToken: 'test-token',
          }),
        }),
        env
      );

      const data = await response.json();

      // Error should not expose:
      // - Which specific service was detected
      // - How detection works
      // - List of blocked domains
      expect(data.error).not.toContain('mailinator');
      expect(data.error).not.toContain('DISPOSABLE_DOMAINS');
      expect(data.error).not.toContain('Set');

      // Should be generic, user-friendly message
      expect(data.error).toBe('Please use a permanent email address');
    });
  });
});
