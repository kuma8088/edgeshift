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

      // Setup: Create delivery logs with various statuses
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at)
        VALUES
          ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'delivered', 1703404800),
          ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'opened', 1703404800),
          ('dl-3', 'camp-1', 'sub-3', 'user3@example.com', 'clicked', 1703404800),
          ('dl-4', 'camp-1', 'sub-4', 'user4@example.com', 'bounced', 1703404800)
      `).run();

      // Import and call the function
      const { getCampaignTracking } = await import('../routes/tracking');
      const result = await getCampaignTracking(env, 'camp-1');

      expect(result).toEqual({
        campaign_id: 'camp-1',
        subject: 'Test Campaign',
        sent_at: 1703404800,
        stats: {
          total_sent: 4,
          delivered: 1,
          opened: 1,
          clicked: 1,
          bounced: 1,
          failed: 0,
          delivery_rate: 25.0,
          open_rate: 66.7,
          click_rate: 33.3,
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
      expect(result!.summary.unique_clickers).toBe(2);
      expect(result!.summary.unique_urls).toBe(2);
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
});
