import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, getTestEnv } from './setup';
import { sendAbTest, sendAbTestWinner, getAbStats } from '../routes/ab-test-send';
import { getTestRatio, splitSubscribers } from '../utils/ab-testing';
import type { Env, Campaign, Subscriber } from '../types';

describe('A/B Test Send Logic', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('splitSubscribers', () => {
    it('should correctly calculate test groups with 20% ratio', () => {
      // 100 subscribers with 20% ratio
      const subscribers = Array.from({ length: 100 }, (_, i) => ({
        id: `sub-${i}`,
        email: `test${i}@example.com`,
        name: `User ${i}`,
        status: 'active' as const,
        confirm_token: null,
        unsubscribe_token: `unsub-${i}`,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      }));

      const { groupA, groupB, remaining } = splitSubscribers(subscribers, 0.2);

      expect(groupA.length).toBe(10);
      expect(groupB.length).toBe(10);
      expect(remaining.length).toBe(80);
    });

    it('should correctly calculate test groups with 50% ratio for small lists', () => {
      const subscribers = Array.from({ length: 50 }, (_, i) => ({
        id: `sub-${i}`,
        email: `test${i}@example.com`,
      }));

      const { groupA, groupB, remaining } = splitSubscribers(subscribers, 0.5);

      expect(groupA.length).toBe(12);
      expect(groupB.length).toBe(12);
      expect(remaining.length).toBe(26);
    });

    it('should correctly calculate test groups with 10% ratio for large lists', () => {
      const subscribers = Array.from({ length: 1000 }, (_, i) => ({
        id: `sub-${i}`,
        email: `test${i}@example.com`,
      }));

      const { groupA, groupB, remaining } = splitSubscribers(subscribers, 0.1);

      expect(groupA.length).toBe(50);
      expect(groupB.length).toBe(50);
      expect(remaining.length).toBe(900);
    });
  });

  describe('getTestRatio', () => {
    it('should return 50% for < 100 subscribers', () => {
      expect(getTestRatio(50)).toBe(0.5);
      expect(getTestRatio(99)).toBe(0.5);
    });

    it('should return 20% for 100-500 subscribers', () => {
      expect(getTestRatio(100)).toBe(0.2);
      expect(getTestRatio(300)).toBe(0.2);
      expect(getTestRatio(500)).toBe(0.2);
    });

    it('should return 10% for > 500 subscribers', () => {
      expect(getTestRatio(501)).toBe(0.1);
      expect(getTestRatio(1000)).toBe(0.1);
    });
  });

  describe('sendAbTest', () => {
    it('should send to both groups and store remaining subscribers', async () => {
      const env = getTestEnv() as Env;

      // Create campaign with A/B test enabled
      const campaignId = 'campaign-ab-1';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled, ab_subject_b, ab_wait_hours)
        VALUES (?, ?, ?, 'scheduled', 1, ?, 4)
      `).bind(campaignId, 'Original Subject', '<p>Test content</p>', 'Variant B Subject').run();

      // Create 100 active subscribers
      const subscribers: Subscriber[] = [];
      for (let i = 0; i < 100; i++) {
        const subId = `sub-${i}`;
        await env.DB.prepare(`
          INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
          VALUES (?, ?, ?, 'active', ?)
        `).bind(subId, `test${i}@example.com`, `User ${i}`, `unsub-${i}`).run();
        subscribers.push({
          id: subId,
          email: `test${i}@example.com`,
          name: `User ${i}`,
          status: 'active',
          confirm_token: null,
          unsubscribe_token: `unsub-${i}`,
          signup_page_slug: null,
          subscribed_at: null,
          unsubscribed_at: null,
          created_at: Date.now(),
          referral_code: null,
          referred_by: null,
          referral_count: 0,
        });
      }

      // Get campaign
      const campaign = await env.DB.prepare(
        'SELECT * FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<Campaign>();

      // Mock send email function
      const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-123' });

      // Execute A/B test send
      const result = await sendAbTest(env, campaign!, subscribers, mockSendEmail);

      // With 100 subscribers and 20% ratio:
      // - groupA: 10, groupB: 10, remaining: 80
      expect(result.groupASent).toBe(10);
      expect(result.groupBSent).toBe(10);
      expect(result.status).toBe('ab_testing');

      // Check that remaining subscribers were stored
      const remainingRow = await env.DB.prepare(
        'SELECT subscriber_ids FROM ab_test_remaining WHERE campaign_id = ?'
      ).bind(campaignId).first<{ subscriber_ids: string }>();
      expect(remainingRow).not.toBeNull();
      const remainingIds = remainingRow!.subscriber_ids.split(',');
      expect(remainingIds.length).toBe(80);

      // Check delivery logs were created
      const logs = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE campaign_id = ?'
      ).bind(campaignId).all();
      expect(logs.results?.length).toBe(20);

      // Check variant distribution
      const variantA = logs.results?.filter(l => l.ab_variant === 'A');
      const variantB = logs.results?.filter(l => l.ab_variant === 'B');
      expect(variantA?.length).toBe(10);
      expect(variantB?.length).toBe(10);

      // Check ab_test_sent_at was set
      const updatedCampaign = await env.DB.prepare(
        'SELECT ab_test_sent_at FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<{ ab_test_sent_at: string }>();
      expect(updatedCampaign?.ab_test_sent_at).not.toBeNull();
    });

    it('should handle empty subscriber list', async () => {
      const env = getTestEnv() as Env;

      const campaignId = 'campaign-empty';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled)
        VALUES (?, ?, ?, 'scheduled', 1)
      `).bind(campaignId, 'Test Subject', '<p>Content</p>').run();

      const campaign = await env.DB.prepare(
        'SELECT * FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<Campaign>();

      const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-123' });

      const result = await sendAbTest(env, campaign!, [], mockSendEmail);

      expect(result.groupASent).toBe(0);
      expect(result.groupBSent).toBe(0);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendAbTestWinner', () => {
    it('should determine winner and send to remaining subscribers', async () => {
      const env = getTestEnv() as Env;

      const campaignId = 'campaign-winner';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled, ab_subject_b)
        VALUES (?, ?, ?, 'scheduled', 1, ?)
      `).bind(campaignId, 'Original Subject', '<p>Test content</p>', 'Better Subject').run();

      // Create 10 subscribers (5 for group A, 5 for group B, rest as remaining)
      for (let i = 0; i < 10; i++) {
        const subId = `sub-winner-${i}`;
        await env.DB.prepare(`
          INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
          VALUES (?, ?, ?, 'active', ?)
        `).bind(subId, `winner${i}@example.com`, `Winner User ${i}`, `unsub-win-${i}`).run();
      }

      // Simulate A/B test logs with variant B having better metrics
      const now = Math.floor(Date.now() / 1000);

      // Group A: 5 sent, 1 opened
      for (let i = 0; i < 5; i++) {
        await env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, opened_at)
          VALUES (?, ?, ?, ?, 'sent', 'A', ?, ?)
        `).bind(
          `log-a-${i}`,
          campaignId,
          `sub-winner-${i}`,
          `winner${i}@example.com`,
          now,
          i === 0 ? now : null // Only first one opened
        ).run();
      }

      // Group B: 3 sent, 2 opened (better open rate)
      for (let i = 0; i < 3; i++) {
        await env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, opened_at)
          VALUES (?, ?, ?, ?, 'sent', 'B', ?, ?)
        `).bind(
          `log-b-${i}`,
          campaignId,
          `sub-winner-${5 + i}`,
          `winner${5 + i}@example.com`,
          now,
          i < 2 ? now : null // First two opened
        ).run();
      }

      // Store remaining subscribers (last 2)
      await env.DB.prepare(`
        INSERT INTO ab_test_remaining (campaign_id, subscriber_ids)
        VALUES (?, ?)
      `).bind(campaignId, 'sub-winner-8,sub-winner-9').run();

      const campaign = await env.DB.prepare(
        'SELECT * FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<Campaign>();

      const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-winner' });

      const result = await sendAbTestWinner(env, campaign!, mockSendEmail);

      // Variant B should win (2/3 = 66% open rate vs 1/5 = 20%)
      expect(result.winner).toBe('B');
      expect(result.remainingSent).toBe(2);

      // Check campaign was updated
      const updatedCampaign = await env.DB.prepare(
        'SELECT status, ab_winner FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<{ status: string; ab_winner: string }>();
      expect(updatedCampaign?.status).toBe('sent');
      expect(updatedCampaign?.ab_winner).toBe('B');

      // Check remaining storage was cleaned up
      const remainingRow = await env.DB.prepare(
        'SELECT * FROM ab_test_remaining WHERE campaign_id = ?'
      ).bind(campaignId).first();
      expect(remainingRow).toBeNull();

      // Check winner's subject was used
      expect(mockSendEmail).toHaveBeenCalledWith(
        env,
        expect.any(String),
        'Better Subject',
        expect.any(String)
      );
    });

    it('should handle case where variant A wins on tie', async () => {
      const env = getTestEnv() as Env;

      const campaignId = 'campaign-tie';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled, ab_subject_b)
        VALUES (?, ?, ?, 'scheduled', 1, ?)
      `).bind(campaignId, 'Subject A', '<p>Content</p>', 'Subject B').run();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES (?, ?, ?, 'active', ?)
      `).bind('sub-tie-1', 'tie@example.com', 'Tie User', 'unsub-tie').run();

      // Create equal stats for both variants
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, opened_at)
        VALUES (?, ?, ?, ?, 'sent', 'A', ?, ?)
      `).bind('log-tie-a', campaignId, 'sub-tie-1', 'tie@example.com', now, now).run();

      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, opened_at)
        VALUES (?, ?, ?, ?, 'sent', 'B', ?, ?)
      `).bind('log-tie-b', campaignId, 'sub-tie-1', 'tieB@example.com', now, now).run();

      // No remaining subscribers
      await env.DB.prepare(`
        INSERT INTO ab_test_remaining (campaign_id, subscriber_ids)
        VALUES (?, ?)
      `).bind(campaignId, '').run();

      const campaign = await env.DB.prepare(
        'SELECT * FROM campaigns WHERE id = ?'
      ).bind(campaignId).first<Campaign>();

      const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-tie' });

      const result = await sendAbTestWinner(env, campaign!, mockSendEmail);

      // A wins on tie
      expect(result.winner).toBe('A');
      expect(result.remainingSent).toBe(0);
    });
  });

  describe('getAbStats', () => {
    it('should return stats for both variants', async () => {
      const env = getTestEnv() as Env;

      const campaignId = 'campaign-stats';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled)
        VALUES (?, ?, ?, 'scheduled', 1)
      `).bind(campaignId, 'Stats Test', '<p>Content</p>').run();

      // Create subscribers first (for foreign key constraint)
      for (let i = 0; i < 20; i++) {
        await env.DB.prepare(`
          INSERT INTO subscribers (id, email, name, status)
          VALUES (?, ?, ?, 'active')
        `).bind(`sub-stat-${i}`, `stat${i}@example.com`, `Stat User ${i}`).run();
      }

      // Create test delivery logs
      const now = Math.floor(Date.now() / 1000);

      // Variant A: 10 sent, 5 opened, 2 clicked
      for (let i = 0; i < 10; i++) {
        await env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, delivered_at, opened_at, clicked_at)
          VALUES (?, ?, ?, ?, 'sent', 'A', ?, ?, ?, ?)
        `).bind(
          `stat-a-${i}`,
          campaignId,
          `sub-stat-${i}`,
          `stat${i}@example.com`,
          now,
          i < 8 ? now : null, // 8 delivered
          i < 5 ? now : null, // 5 opened
          i < 2 ? now : null  // 2 clicked
        ).run();
      }

      // Variant B: 10 sent, 8 opened, 4 clicked
      for (let i = 0; i < 10; i++) {
        await env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, ab_variant, sent_at, delivered_at, opened_at, clicked_at)
          VALUES (?, ?, ?, ?, 'sent', 'B', ?, ?, ?, ?)
        `).bind(
          `stat-b-${i}`,
          campaignId,
          `sub-stat-${i + 10}`,
          `stat${i + 10}@example.com`,
          now,
          i < 9 ? now : null, // 9 delivered
          i < 8 ? now : null, // 8 opened
          i < 4 ? now : null  // 4 clicked
        ).run();
      }

      const stats = await getAbStats(env, campaignId);

      expect(stats.variant_a.sent).toBe(10);
      expect(stats.variant_a.opened).toBe(5);
      expect(stats.variant_a.clicked).toBe(2);
      expect(stats.variant_a.open_rate).toBe(0.5);
      expect(stats.variant_a.click_rate).toBe(0.2);

      expect(stats.variant_b.sent).toBe(10);
      expect(stats.variant_b.opened).toBe(8);
      expect(stats.variant_b.clicked).toBe(4);
      expect(stats.variant_b.open_rate).toBe(0.8);
      expect(stats.variant_b.click_rate).toBe(0.4);
    });

    it('should return empty stats for campaign with no logs', async () => {
      const env = getTestEnv() as Env;

      const campaignId = 'campaign-no-stats';
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, ab_test_enabled)
        VALUES (?, ?, ?, 'scheduled', 1)
      `).bind(campaignId, 'No Stats', '<p>Content</p>').run();

      const stats = await getAbStats(env, campaignId);

      expect(stats.variant_a.sent).toBe(0);
      expect(stats.variant_a.opened).toBe(0);
      expect(stats.variant_b.sent).toBe(0);
      expect(stats.variant_b.opened).toBe(0);
    });
  });
});
