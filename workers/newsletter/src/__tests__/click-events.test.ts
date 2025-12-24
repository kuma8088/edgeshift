import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { recordClickEvent, getClickEvents } from '../lib/delivery';

describe('click events', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'unsub-token')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'sent')
    `).run();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('recordClickEvent', () => {
    it('should record a click event', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      const event = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').first();

      expect(event).toBeTruthy();
      expect(event?.subscriber_id).toBe('sub-1');
      expect(event?.clicked_url).toBe('https://example.com/article');
      expect(event?.clicked_at).toBeGreaterThan(0);
    });

    it('should record multiple clicks on same URL', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      const events = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').all();

      expect(events.results).toHaveLength(2);
    });

    it('should record clicks on different URLs', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article1',
      });

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article2',
      });

      const events = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').all();

      expect(events.results).toHaveLength(2);
      const urls = events.results?.map((e: { clicked_url: string }) => e.clicked_url);
      expect(urls).toContain('https://example.com/article1');
      expect(urls).toContain('https://example.com/article2');
    });
  });

  describe('getClickEvents', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      const now = Math.floor(Date.now() / 1000);

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
          VALUES ('click-1', 'log-1', 'sub-1', 'https://example.com/a', ?)
        `).bind(now),
        env.DB.prepare(`
          INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
          VALUES ('click-2', 'log-1', 'sub-1', 'https://example.com/b', ?)
        `).bind(now + 10),
      ]);
    });

    it('should get all click events for a delivery log', async () => {
      const env = getTestEnv();

      const events = await getClickEvents(env, 'log-1');

      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent delivery log', async () => {
      const env = getTestEnv();

      const events = await getClickEvents(env, 'non-existent');

      expect(events).toHaveLength(0);
    });
  });
});
