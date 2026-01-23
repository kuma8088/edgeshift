import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Redirect Handler', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('handleRedirect', () => {
    it('should return 302 redirect with Location header for valid code', async () => {
      const env = getTestEnv();

      // Setup: Create a short URL record
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-1', 'AbCd1234', 'https://example.com/original-article', 1, 1703404800)
      `).run();

      // Import and call the handler
      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/AbCd1234');
      const response = await handleRedirect(request, env, 'AbCd1234');

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://example.com/original-article');
    });

    it('should return 404 for invalid code', async () => {
      const env = getTestEnv();

      // No short URL exists in DB

      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/NotExist');
      const response = await handleRedirect(request, env, 'NotExist');

      expect(response.status).toBe(404);
    });

    it('should return 404 for empty code', async () => {
      const env = getTestEnv();

      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/');
      const response = await handleRedirect(request, env, '');

      expect(response.status).toBe(404);
    });

    it('should handle codes with different cases correctly', async () => {
      const env = getTestEnv();

      // Setup: Create a short URL record with mixed case
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-2', 'XyZ78901', 'https://example.com/case-sensitive', 1, 1703404800)
      `).run();

      const { handleRedirect } = await import('../routes/redirect');

      // Exact case match should work
      const response1 = await handleRedirect(
        new Request('https://edgeshift.tech/r/XyZ78901'),
        env,
        'XyZ78901'
      );
      expect(response1.status).toBe(302);
      expect(response1.headers.get('Location')).toBe('https://example.com/case-sensitive');

      // Different case should not match (case-sensitive)
      const response2 = await handleRedirect(
        new Request('https://edgeshift.tech/r/xyz78901'),
        env,
        'xyz78901'
      );
      expect(response2.status).toBe(404);
    });
  });
});
