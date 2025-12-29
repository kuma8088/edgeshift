import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../index';
import { setupTestDb, cleanupTestDb } from './setup';

describe('Dashboard Stats API', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  it('should return 401 without authorization', async () => {
    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('should return empty stats for empty database', async () => {
    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.subscribers.total).toBe(0);
    expect(data.data.campaigns.total).toBe(0);
    expect(data.data.delivery.total).toBe(0);
  });

  it('should return correct stats with data', async () => {
    // Create test data
    await env.DB.batch([
      // Subscribers: 2 active, 1 pending, 1 unsubscribed
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s1', 'a1@test.com', 'active'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s2', 'a2@test.com', 'active'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s3', 'p1@test.com', 'pending'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s4', 'u1@test.com', 'unsubscribed'),
      // Campaigns: 1 draft, 1 scheduled, 2 sent
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c1', 'Draft', 'c', 'draft'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c2', 'Scheduled', 'c', 'scheduled'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c3', 'Sent1', 'c', 'sent'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c4', 'Sent2', 'c', 'sent'),
      // Delivery logs: 2 delivered, 1 opened, 1 clicked
      // Note: Dashboard counts timestamp fields, not status
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, delivered_at) VALUES (?, ?, ?, ?, ?, ?)`).bind('d1', 'c3', 's1', 'a1@test.com', 'delivered', '2024-01-01 10:00:00'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, delivered_at) VALUES (?, ?, ?, ?, ?, ?)`).bind('d2', 'c3', 's2', 'a2@test.com', 'delivered', '2024-01-01 10:00:00'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, delivered_at, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind('d3', 'c4', 's1', 'a1@test.com', 'opened', '2024-01-01 10:00:00', '2024-01-01 10:05:00'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, delivered_at, opened_at, clicked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind('d4', 'c4', 's2', 'a2@test.com', 'clicked', '2024-01-01 10:00:00', '2024-01-01 10:05:00', '2024-01-01 10:10:00'),
    ]);

    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);

    const { subscribers, campaigns, delivery } = result.data;

    expect(subscribers.total).toBe(4);
    expect(subscribers.active).toBe(2);
    expect(subscribers.pending).toBe(1);
    expect(subscribers.unsubscribed).toBe(1);

    expect(campaigns.total).toBe(4);
    expect(campaigns.draft).toBe(1);
    expect(campaigns.scheduled).toBe(1);
    expect(campaigns.sent).toBe(2);

    expect(delivery.total).toBe(4);
    expect(delivery.delivered).toBe(4); // All 4 have delivered_at timestamps
    expect(delivery.opened).toBe(2); // 2 have opened_at (d3, d4)
    expect(delivery.clicked).toBe(1); // 1 has clicked_at (d4)
  });
});
