import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('analytics API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('getAnalyticsOverview', () => {
    it('should return aggregated analytics data', async () => {
      const env = getTestEnv();

      // Setup: Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status)
        VALUES
          ('sub-1', 'user1@example.com', 'User 1', 'active'),
          ('sub-2', 'user2@example.com', 'User 2', 'active'),
          ('sub-3', 'user3@example.com', 'User 3', 'active'),
          ('sub-4', 'user4@example.com', 'User 4', 'active'),
          ('sub-5', 'user5@example.com', 'User 5', 'active')
      `).run();

      // Setup: Create campaigns
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, sent_at, recipient_count)
        VALUES
          ('camp-1', 'Campaign 1', '<p>Content 1</p>', 'sent', 1703404800, 5),
          ('camp-2', 'Campaign 2', '<p>Content 2</p>', 'sent', 1703491200, 5),
          ('camp-3', 'Campaign 3', '<p>Content 3</p>', 'draft', NULL, NULL)
      `).run();

      // Setup: Create delivery logs for campaign 1
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at, opened_at)
        VALUES
          ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'opened', 1703404800, 1703408400),
          ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'clicked', 1703404800, 1703408400),
          ('dl-3', 'camp-1', 'sub-3', 'user3@example.com', 'delivered', 1703404800, NULL),
          ('dl-4', 'camp-1', 'sub-4', 'user4@example.com', 'delivered', 1703404800, NULL),
          ('dl-5', 'camp-1', 'sub-5', 'user5@example.com', 'bounced', 1703404800, NULL)
      `).run();

      // Setup: Create delivery logs for campaign 2
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at, opened_at)
        VALUES
          ('dl-6', 'camp-2', 'sub-1', 'user1@example.com', 'opened', 1703491200, 1703494800),
          ('dl-7', 'camp-2', 'sub-2', 'user2@example.com', 'delivered', 1703491200, NULL),
          ('dl-8', 'camp-2', 'sub-3', 'user3@example.com', 'delivered', 1703491200, NULL),
          ('dl-9', 'camp-2', 'sub-4', 'user4@example.com', 'delivered', 1703491200, NULL),
          ('dl-10', 'camp-2', 'sub-5', 'user5@example.com', 'delivered', 1703491200, NULL)
      `).run();

      // Setup: Create click events
      await env.DB.prepare(`
        INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
        VALUES
          ('ce-1', 'dl-2', 'sub-2', 'https://example.com/link1', 1703410000),
          ('ce-2', 'dl-2', 'sub-2', 'https://example.com/link2', 1703411000)
      `).run();

      // Setup: Create sequences
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, description, default_send_time, is_active)
        VALUES
          ('seq-1', 'Welcome Series', 'Onboarding sequence', '09:00', 1),
          ('seq-2', 'Inactive Sequence', 'Old sequence', '10:00', 0)
      `).run();

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES
          ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome</p>'),
          ('step-2', 'seq-1', 2, 2, 'Day 2', '<p>Day 2</p>'),
          ('step-3', 'seq-1', 3, 5, 'Day 5', '<p>Day 5</p>')
      `).run();

      // Setup: Create subscriber sequences
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at, completed_at)
        VALUES
          ('ss-1', 'sub-1', 'seq-1', 3, 1703000000, 1703300000),
          ('ss-2', 'sub-2', 'seq-1', 2, 1703100000, NULL),
          ('ss-3', 'sub-3', 'seq-1', 1, 1703200000, NULL)
      `).run();

      // Import and call the function
      const { getAnalyticsOverview } = await import('../routes/analytics');
      const result = await getAnalyticsOverview(env);

      // Verify campaigns (should have 2 sent campaigns)
      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0]).toMatchObject({
        subject: 'Campaign 2',
        sent_at: 1703491200,
        recipient_count: 5,
        open_rate: 20.0, // 1/5
        click_rate: 0.0, // 0/5
      });
      expect(result.campaigns[1]).toMatchObject({
        subject: 'Campaign 1',
        sent_at: 1703404800,
        recipient_count: 5,
        open_rate: 40.0, // 2/5 (opened + clicked)
        click_rate: 20.0, // 1/5
      });

      // Verify sequences
      expect(result.sequences).toHaveLength(1);
      expect(result.sequences[0]).toMatchObject({
        name: 'Welcome Series',
        enrolled: 3,
        completion_rate: 33.3, // 1/3 completed
      });

      // Verify top subscribers
      expect(result.top_subscribers).toHaveLength(5);
      // sub-2 should be first (2 clicks, 1 opened delivery_log)
      expect(result.top_subscribers[0]).toMatchObject({
        email: 'user2@example.com',
        name: 'User 2',
        open_count: 1, // Only dl-2 has status='clicked' (counts as opened)
        click_count: 2, // 2 click_events
      });
      // sub-1 should be second (0 clicks, 2 opened delivery_logs)
      expect(result.top_subscribers[1]).toMatchObject({
        email: 'user1@example.com',
        name: 'User 1',
        open_count: 2, // dl-1 and dl-6 both have status='opened'
        click_count: 0,
      });
    });

    it('should return empty arrays when no data exists', async () => {
      const env = getTestEnv();
      const { getAnalyticsOverview } = await import('../routes/analytics');
      const result = await getAnalyticsOverview(env);

      expect(result.campaigns).toHaveLength(0);
      expect(result.sequences).toHaveLength(0);
      expect(result.top_subscribers).toHaveLength(0);
    });
  });
});
