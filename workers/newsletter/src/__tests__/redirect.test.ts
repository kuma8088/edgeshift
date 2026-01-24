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

  describe('Automatic Unsubscribe Safeguard (Task 3)', () => {
    it('should detect and auto-unsubscribe when short URL points to unsubscribe.resend.com', async () => {
      const env = getTestEnv();

      // Setup: Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES ('sub-1', 'user@example.com', 'active', 'unsub-token-123')
      `).run();

      // Setup: Create short URL pointing to Resend unsubscribe
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-1', 'AbCd1234', 'https://unsubscribe.resend.com/xxx', 1, 1703404800)
      `).run();

      // Import and call the handler
      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/AbCd1234?email=user@example.com');
      const response = await handleRedirect(request, env, 'AbCd1234');

      // Should redirect to unsubscribed page (not to Resend)
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify subscriber was unsubscribed
      const subscriber = await env.DB.prepare(
        'SELECT status FROM subscribers WHERE id = ?'
      ).bind('sub-1').first<{ status: string }>();
      expect(subscriber?.status).toBe('unsubscribed');
    });

    it('should detect and auto-unsubscribe when short URL points to /api/newsletter/unsubscribe', async () => {
      const env = getTestEnv();

      // Setup: Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES ('sub-2', 'user2@example.com', 'active', 'unsub-token-456')
      `).run();

      // Setup: Create short URL pointing to our unsubscribe endpoint
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-2', 'XyZ78901', 'https://edgeshift.tech/api/newsletter/unsubscribe/unsub-token-456', 1, 1703404800)
      `).run();

      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/XyZ78901');
      const response = await handleRedirect(request, env, 'XyZ78901');

      // Should redirect to unsubscribed page
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify subscriber was unsubscribed
      const subscriber = await env.DB.prepare(
        'SELECT status FROM subscribers WHERE id = ?'
      ).bind('sub-2').first<{ status: string }>();
      expect(subscriber?.status).toBe('unsubscribed');
    });

    it('should detect RESEND_UNSUBSCRIBE_URL placeholder', async () => {
      const env = getTestEnv();

      // Setup: Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES ('sub-3', 'user3@example.com', 'active', 'unsub-token-789')
      `).run();

      // Setup: Create short URL pointing to placeholder (shouldn't happen with Task 1 fix, but safeguard)
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-3', 'PlAc3Hld', '{{RESEND_UNSUBSCRIBE_URL}}', 1, 1703404800)
      `).run();

      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/PlAc3Hld?email=user3@example.com');
      const response = await handleRedirect(request, env, 'PlAc3Hld');

      // Should redirect to unsubscribed page
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify subscriber was unsubscribed
      const subscriber = await env.DB.prepare(
        'SELECT status FROM subscribers WHERE id = ?'
      ).bind('sub-3').first<{ status: string }>();
      expect(subscriber?.status).toBe('unsubscribed');
    });

    it('should NOT trigger unsubscribe for normal URLs', async () => {
      const env = getTestEnv();

      // Setup: Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES ('sub-4', 'user4@example.com', 'active', 'unsub-token-000')
      `).run();

      // Setup: Create normal short URL
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, created_at)
        VALUES ('url-4', 'NoRm4lLn', 'https://example.com/article', 1, 1703404800)
      `).run();

      const { handleRedirect } = await import('../routes/redirect');
      const request = new Request('https://edgeshift.tech/r/NoRm4lLn');
      const response = await handleRedirect(request, env, 'NoRm4lLn');

      // Should redirect to original URL
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://example.com/article');

      // Verify subscriber is still active
      const subscriber = await env.DB.prepare(
        'SELECT status FROM subscribers WHERE id = ?'
      ).bind('sub-4').first<{ status: string }>();
      expect(subscriber?.status).toBe('active');
    });

    it('should auto-unsubscribe via Referer header + campaign_id (NEW)', async () => {
      const env = getTestEnv();

      // Setup: Create campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, created_at)
        VALUES ('campaign-test', 'Test Campaign', '<p>Test</p>', 'sent', 1703404800)
      `).run();

      // Setup: Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token, created_at)
        VALUES ('sub-5', 'user5@example.com', 'active', 'unsub-token-555', 1703404800)
      `).run();

      // Setup: Create delivery log
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, subscriber_id, campaign_id, resend_id, email, status, sent_at)
        VALUES (
          'log-test-referer',
          'sub-5',
          'campaign-test',
          '0106019b-ee8c-d588-9cba-3948d664c15f-000000',
          'user5@example.com',
          'sent',
          1703404800
        )
      `).run();

      // Setup: Create shortened unsubscribe URL with campaign_id
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, campaign_id, created_at)
        VALUES ('url-5', 'RefTest1', '{{{RESEND_UNSUBSCRIBE_URL}}}', 1, 'campaign-test', 1703404800)
      `).run();

      const { handleRedirect } = await import('../routes/redirect');

      // Simulate Resend click tracking Referer header
      const request = new Request('https://edgeshift.tech/r/RefTest1', {
        headers: {
          'Referer': 'https://562dec88f516adfa06a1977058f18b0b.ap-northeast-1.resend-clicks-a.com/CL0/https:%2F%2Fedgeshift.tech%2Fr%2FRefTest1/1/0106019b-ee8c-d588-9cba-3948d664c15f-000000/signature=123'
        }
      });
      const response = await handleRedirect(request, env, 'RefTest1');

      // Should redirect to unsubscribed page
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify subscriber was unsubscribed via Referer lookup
      const subscriber = await env.DB.prepare(
        'SELECT status, email FROM subscribers WHERE id = ?'
      ).bind('sub-5').first<{ status: string; email: string }>();
      expect(subscriber?.status).toBe('unsubscribed');
      expect(subscriber?.email).toBe('user5@example.com');
    });
  });
});
