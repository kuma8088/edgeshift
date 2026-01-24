import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleUnsubscribe } from '../routes/unsubscribe';
import type { Env, Subscriber } from '../types';
import { getTestEnv, setupTestDb } from './setup';

// Mock resend-marketing module
vi.mock('../lib/resend-marketing', () => ({
  updateContactUnsubscribe: vi.fn(),
  ResendMarketingConfig: {},
}));

// Import mocked function
import { updateContactUnsubscribe } from '../lib/resend-marketing';

describe('Unsubscribe Handler', () => {
  let env: Env;
  let mockRequest: Request;

  beforeEach(async () => {
    env = getTestEnv();
    await setupTestDb();
    mockRequest = new Request('https://example.com/unsubscribe');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleUnsubscribe', () => {
    it('should unsubscribe a subscriber and sync to Resend', async () => {
      // Create an active subscriber
      const subscriberId = crypto.randomUUID();
      const unsubscribeToken = crypto.randomUUID();
      const email = 'active@example.com';

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        subscriberId,
        email,
        'Active User',
        'active',
        unsubscribeToken,
        Math.floor(Date.now() / 1000)
      ).run();

      // Mock successful Resend sync
      vi.mocked(updateContactUnsubscribe).mockResolvedValueOnce({
        success: true,
      });

      // Call unsubscribe handler
      const response = await handleUnsubscribe(mockRequest, env, unsubscribeToken);

      // Verify redirect to confirmation page
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify D1 was updated
      const subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE id = ?'
      ).bind(subscriberId).first<Subscriber>();

      expect(subscriber?.status).toBe('unsubscribed');
      expect(subscriber?.unsubscribed_at).toBeGreaterThan(0);

      // Verify Resend sync was called
      expect(updateContactUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: env.RESEND_API_KEY,
        }),
        email
      );
    });

    it('should unsubscribe even if Resend sync fails (non-blocking)', async () => {
      // Create an active subscriber
      const subscriberId = crypto.randomUUID();
      const unsubscribeToken = crypto.randomUUID();
      const email = 'active@example.com';

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        subscriberId,
        email,
        'Active User',
        'active',
        unsubscribeToken,
        Math.floor(Date.now() / 1000)
      ).run();

      // Mock failed Resend sync
      vi.mocked(updateContactUnsubscribe).mockResolvedValueOnce({
        success: false,
        error: 'Contact not found',
      });

      // Call unsubscribe handler
      const response = await handleUnsubscribe(mockRequest, env, unsubscribeToken);

      // Verify redirect to confirmation page (should still succeed)
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify D1 was updated (source of truth)
      const subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE id = ?'
      ).bind(subscriberId).first<Subscriber>();

      expect(subscriber?.status).toBe('unsubscribed');
      expect(subscriber?.unsubscribed_at).toBeGreaterThan(0);

      // Verify Resend sync was attempted
      expect(updateContactUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: env.RESEND_API_KEY,
        }),
        email
      );
    });

    it('should unsubscribe even if Resend sync throws exception (non-blocking)', async () => {
      // Create an active subscriber
      const subscriberId = crypto.randomUUID();
      const unsubscribeToken = crypto.randomUUID();
      const email = 'active@example.com';

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        subscriberId,
        email,
        'Active User',
        'active',
        unsubscribeToken,
        Math.floor(Date.now() / 1000)
      ).run();

      // Mock Resend sync throwing exception
      vi.mocked(updateContactUnsubscribe).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      // Call unsubscribe handler
      const response = await handleUnsubscribe(mockRequest, env, unsubscribeToken);

      // Verify redirect to confirmation page (should still succeed)
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');

      // Verify D1 was updated (source of truth)
      const subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE id = ?'
      ).bind(subscriberId).first<Subscriber>();

      expect(subscriber?.status).toBe('unsubscribed');
      expect(subscriber?.unsubscribed_at).toBeGreaterThan(0);
    });

    it('should return error for invalid token', async () => {
      const response = await handleUnsubscribe(mockRequest, env, '');

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('status=error');
      expect(response.headers.get('Location')).toContain('Invalid+unsubscribe+link');

      // Verify Resend sync was not called
      expect(updateContactUnsubscribe).not.toHaveBeenCalled();
    });

    it('should return error for non-existent token', async () => {
      const response = await handleUnsubscribe(mockRequest, env, crypto.randomUUID());

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('status=error');
      expect(response.headers.get('Location')).toContain('Invalid+unsubscribe+link');

      // Verify Resend sync was not called
      expect(updateContactUnsubscribe).not.toHaveBeenCalled();
    });

    it('should return info message for already unsubscribed user', async () => {
      // Create an already unsubscribed subscriber
      const subscriberId = crypto.randomUUID();
      const unsubscribeToken = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at, unsubscribed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        subscriberId,
        'unsubscribed@example.com',
        'Unsubscribed User',
        'unsubscribed',
        unsubscribeToken,
        Math.floor(Date.now() / 1000) - 3600,
        Math.floor(Date.now() / 1000) - 1800
      ).run();

      const response = await handleUnsubscribe(mockRequest, env, unsubscribeToken);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('status=info');
      expect(response.headers.get('Location')).toContain('Already+unsubscribed');

      // Verify Resend sync was not called (already unsubscribed)
      expect(updateContactUnsubscribe).not.toHaveBeenCalled();
    });
  });
});
