import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('tracking API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('getCampaignTracking', () => {
    it('should return tracking stats for a campaign', async () => {
      const env = getTestEnv();

      // Setup: Create subscribers (required for foreign key)
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES
          ('sub-1', 'user1@example.com', 'active'),
          ('sub-2', 'user2@example.com', 'active'),
          ('sub-3', 'user3@example.com', 'active'),
          ('sub-4', 'user4@example.com', 'active')
      `).run();

      // Setup: Create campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, sent_at)
        VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent', 1703404800)
      `).run();

      // Setup: Create delivery logs with various statuses and timestamps
      // With timestamp-based counting:
      // - delivered: 3 (dl-1, dl-2, dl-3 have delivered_at)
      // - opened: 2 (dl-2, dl-3 have opened_at)
      // - clicked: 1 (dl-3 has clicked_at)
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at, delivered_at, opened_at, clicked_at)
        VALUES
          ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'delivered', 1703404800, 1703404800, NULL, NULL),
          ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'opened', 1703404800, 1703404800, 1703408400, NULL),
          ('dl-3', 'camp-1', 'sub-3', 'user3@example.com', 'clicked', 1703404800, 1703404800, 1703408400, 1703412000),
          ('dl-4', 'camp-1', 'sub-4', 'user4@example.com', 'bounced', 1703404800, NULL, NULL, NULL)
      `).run();

      // Import and call the function
      const { getCampaignTracking } = await import('../routes/tracking');
      const result = await getCampaignTracking(env, 'camp-1');

      // Expected with timestamp-based counting:
      // - delivered: 3 (all with delivered_at)
      // - opened: 2 (all with opened_at)
      // - clicked: 1 (all with clicked_at)
      // - reached: 3 (= delivered)
      // - delivery_rate: 75.0 (3/4 * 100)
      // - open_rate: 66.7 (2/3 * 100)
      // - click_rate: 50.0 (1/2 * 100)
      expect(result).toEqual({
        campaign_id: 'camp-1',
        subject: 'Test Campaign',
        sent_at: 1703404800,
        stats: {
          total_sent: 4,
          delivered: 3,
          opened: 2,
          clicked: 1,
          bounced: 1,
          failed: 0,
          reached: 3,
          delivery_rate: 75.0,
          open_rate: 66.7,
          click_rate: 50.0,
        },
      });
    });

    it('should return null for non-existent campaign', async () => {
      const env = getTestEnv();
      const { getCampaignTracking } = await import('../routes/tracking');
      const result = await getCampaignTracking(env, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getCampaignClicks', () => {
    it('should return all clicks for a campaign', async () => {
      const env = getTestEnv();

      // Setup: Create subscribers (required for foreign key)
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status)
        VALUES
          ('sub-1', 'user1@example.com', 'User 1', 'active'),
          ('sub-2', 'user2@example.com', 'User 2', 'active')
      `).run();

      // Setup: Create campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status)
        VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent')
      `).run();

      // Setup: Create delivery logs
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status)
        VALUES
          ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'clicked'),
          ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'clicked')
      `).run();

      // Setup: Create click events
      await env.DB.prepare(`
        INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
        VALUES
          ('ce-1', 'dl-1', 'sub-1', 'https://example.com/article1', 1703404800),
          ('ce-2', 'dl-1', 'sub-1', 'https://example.com/article1', 1703408400),
          ('ce-3', 'dl-2', 'sub-2', 'https://example.com/article2', 1703410000)
      `).run();

      // Import and call the function
      const { getCampaignClicks } = await import('../routes/tracking');
      const result = await getCampaignClicks(env, 'camp-1');

      expect(result).not.toBeNull();
      expect(result!.campaign_id).toBe('camp-1');
      expect(result!.summary.total_clicks).toBe(3);
      expect(result!.summary.unique_clicks).toBe(2);
      expect(result!.summary.top_urls).toHaveLength(2);
      expect(result!.summary.top_urls[0].clicks).toBeGreaterThanOrEqual(result!.summary.top_urls[1].clicks);
      expect(result!.clicks).toHaveLength(3);
      expect(result!.clicks[0]).toMatchObject({
        email: 'user2@example.com',
        name: 'User 2',
        url: 'https://example.com/article2',
      });
    });

    it('should return empty clicks for campaign with no clicks', async () => {
      const env = getTestEnv();

      // Setup: Create campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status)
        VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent')
      `).run();

      const { getCampaignClicks } = await import('../routes/tracking');
      const result = await getCampaignClicks(env, 'camp-1');

      expect(result).not.toBeNull();
      expect(result!.summary.total_clicks).toBe(0);
      expect(result!.clicks).toHaveLength(0);
    });

    it('should return null for non-existent campaign', async () => {
      const env = getTestEnv();
      const { getCampaignClicks } = await import('../routes/tracking');
      const result = await getCampaignClicks(env, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getSubscriberEngagement', () => {
    it('should return engagement history for campaigns and sequences', async () => {
      const env = getTestEnv();

      // Setup subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status)
        VALUES ('sub-1', 'user@example.com', 'Test User', 'active')
      `).run();

      // Setup campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status)
        VALUES ('camp-1', 'Campaign Subject', '<p>Content</p>', 'sent')
      `).run();

      // Setup sequence
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES ('seq-1', 'Welcome Series', 1)
      `).run();

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome content</p>')
      `).run();

      // Setup delivery logs
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at, opened_at)
        VALUES ('dl-1', 'camp-1', 'sub-1', 'user@example.com', 'opened', 1703404800, 1703408400)
      `).run();

      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at)
        VALUES ('dl-2', 'seq-1', 'step-1', 'sub-1', 'user@example.com', 'delivered', 1703300000)
      `).run();

      // Setup click for campaign
      await env.DB.prepare(`
        INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
        VALUES ('ce-1', 'dl-1', 'sub-1', 'https://example.com/link', 1703410000)
      `).run();

      const { getSubscriberEngagement } = await import('../routes/tracking');
      const result = await getSubscriberEngagement(env, 'sub-1');

      expect(result).not.toBeNull();
      expect(result!.subscriber.email).toBe('user@example.com');
      expect(result!.campaigns).toHaveLength(1);
      expect(result!.campaigns[0].subject).toBe('Campaign Subject');
      expect(result!.campaigns[0].clicks).toHaveLength(1);
      expect(result!.sequences).toHaveLength(1);
      expect(result!.sequences[0].name).toBe('Welcome Series');
      expect(result!.sequences[0].steps).toHaveLength(1);
    });

    it('should return null for non-existent subscriber', async () => {
      const env = getTestEnv();
      const { getSubscriberEngagement } = await import('../routes/tracking');
      const result = await getSubscriberEngagement(env, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getDashboardStats (with sequences)', () => {
    it('should return dashboard stats including sequence statistics', async () => {
      const env = getTestEnv();

      // Setup: Create sequences
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES
          ('seq-1', 'Active Sequence 1', 1),
          ('seq-2', 'Active Sequence 2', 1),
          ('seq-3', 'Inactive Sequence', 0)
      `).run();

      // Setup: Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES
          ('sub-1', 'user1@example.com', 'active'),
          ('sub-2', 'user2@example.com', 'active'),
          ('sub-3', 'user3@example.com', 'active'),
          ('sub-4', 'user4@example.com', 'active')
      `).run();

      // Setup: Create subscriber_sequences (enrollments)
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at, completed_at)
        VALUES
          ('ss-1', 'sub-1', 'seq-1', 1, 1703404800, NULL),
          ('ss-2', 'sub-2', 'seq-1', 2, 1703404800, NULL),
          ('ss-3', 'sub-3', 'seq-2', 3, 1703404800, 1703500000),
          ('ss-4', 'sub-4', 'seq-2', 3, 1703404800, 1703500000)
      `).run();

      // Import and call the function
      const { getDashboardStats } = await import('../routes/dashboard');
      const mockRequest = new Request('http://localhost/api/dashboard/stats', {
        headers: { 'Authorization': 'Bearer test-admin-key' },
      });
      const response = await getDashboardStats(mockRequest, env);
      const result = await response.json();

      // Expected:
      // - total: 3 sequences (includes inactive)
      // - active: 2 sequences (is_active=1)
      // - totalEnrolled: 2 (ss-1, ss-2 have completed_at=NULL)
      // - completed: 2 (ss-3, ss-4 have completed_at)
      expect(result.success).toBe(true);
      expect(result.data.sequences).toEqual({
        total: 3,
        active: 2,
        totalEnrolled: 2,
        completed: 2,
      });
    });

    it('should return zero stats when no sequences exist', async () => {
      const env = getTestEnv();

      const { getDashboardStats } = await import('../routes/dashboard');
      const mockRequest = new Request('http://localhost/api/dashboard/stats', {
        headers: { 'Authorization': 'Bearer test-admin-key' },
      });
      const response = await getDashboardStats(mockRequest, env);
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.sequences).toEqual({
        total: 0,
        active: 0,
        totalEnrolled: 0,
        completed: 0,
      });
    });
  });
});
