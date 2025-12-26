import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanupTestDb, getTestEnv, setupTestDb } from './setup';
import { handleUpdateSubscriber } from '../routes/broadcast';

describe('Subscribers API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('updateSubscriber', () => {
    it('should update subscriber name', async () => {
      const env = getTestEnv();

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Old Name', 'active', Math.floor(Date.now() / 1000)).run();

      // Update name
      const request = new Request(`http://localhost/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ name: 'New Name' }),
      });

      const response = await handleUpdateSubscriber(request, env, subscriberId);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.subscriber.name).toBe('New Name');
      expect(data.data.subscriber.status).toBe('active');
    });

    it('should update subscriber status to unsubscribed', async () => {
      const env = getTestEnv();

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, subscribed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Test User', 'active', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

      // Update status to unsubscribed
      const request = new Request(`http://localhost/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ status: 'unsubscribed' }),
      });

      const response = await handleUpdateSubscriber(request, env, subscriberId);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.subscriber.status).toBe('unsubscribed');
      expect(data.data.subscriber.unsubscribed_at).toBeGreaterThan(0);
    });

    it('should update subscriber status to active', async () => {
      const env = getTestEnv();

      // Create unsubscribed subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Test User', 'unsubscribed', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

      // Update status to active
      const request = new Request(`http://localhost/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });

      const response = await handleUpdateSubscriber(request, env, subscriberId);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.subscriber.status).toBe('active');
      expect(data.data.subscriber.subscribed_at).toBeGreaterThan(0);
    });

    it('should reject invalid status', async () => {
      const env = getTestEnv();

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Test User', 'active', Math.floor(Date.now() / 1000)).run();

      // Try to update with invalid status
      const request = new Request(`http://localhost/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ status: 'pending' }),
      });

      const response = await handleUpdateSubscriber(request, env, subscriberId);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid status');
    });

    it('should return 404 for non-existent subscriber', async () => {
      const env = getTestEnv();

      const request = new Request('http://localhost/api/subscribers/nonexistent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await handleUpdateSubscriber(request, env, 'nonexistent');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });

    it('should update both name and status', async () => {
      const env = getTestEnv();

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Old Name', 'active', Math.floor(Date.now() / 1000)).run();

      // Update both
      const request = new Request(`http://localhost/api/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ name: 'New Name', status: 'unsubscribed' }),
      });

      const response = await handleUpdateSubscriber(request, env, subscriberId);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.subscriber.name).toBe('New Name');
      expect(data.data.subscriber.status).toBe('unsubscribed');
    });

    it('should require authentication', async () => {
      const env = getTestEnv();

      const request = new Request('http://localhost/api/subscribers/test-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await handleUpdateSubscriber(request, env, 'test-id');

      expect(response.status).toBe(401);
    });
  });
});
