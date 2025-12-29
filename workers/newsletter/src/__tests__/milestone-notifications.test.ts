import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { sendMilestoneNotifications } from '../lib/milestone-notifications';
import { handleConfirm } from '../routes/confirm';
import type { Subscriber, ReferralMilestone, Env } from '../types';

// Mock the email module
vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'test-email-id' }),
}));

import { sendEmail } from '../lib/email';
const mockSendEmail = vi.mocked(sendEmail);

describe('Milestone Notifications', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('sendMilestoneNotifications', () => {
    it('should send both admin and subscriber notifications', async () => {
      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      const referrer: Subscriber = {
        id: 'ref1',
        email: 'referrer@test.com',
        name: 'Test Referrer',
        status: 'active',
        confirm_token: null,
        unsubscribe_token: 'unsub-token',
        signup_page_slug: null,
        subscribed_at: Date.now(),
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: 'REFCODE1',
        referred_by: null,
        referral_count: 3,
      };

      const milestone: ReferralMilestone = {
        id: 'm1',
        threshold: 3,
        name: 'Bronze',
        description: 'First milestone',
        reward_type: 'badge',
        reward_value: 'bronze-badge',
        created_at: Date.now(),
      };

      const result = await sendMilestoneNotifications(env as Env, referrer, milestone, 3);

      expect(result.adminNotified).toBe(true);
      expect(result.subscriberNotified).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);

      // Check admin notification
      const adminCall = mockSendEmail.mock.calls.find((call) =>
        call[2].to === 'admin@test.com'
      );
      expect(adminCall).toBeDefined();
      expect(adminCall?.[2].subject).toContain('Milestone Achievement');
      expect(adminCall?.[2].subject).toContain('referrer@test.com');
      expect(adminCall?.[2].subject).toContain('Bronze');

      // Check subscriber notification
      const subscriberCall = mockSendEmail.mock.calls.find((call) =>
        call[2].to === 'referrer@test.com'
      );
      expect(subscriberCall).toBeDefined();
      expect(subscriberCall?.[2].subject).toContain('Congratulations');
      expect(subscriberCall?.[2].subject).toContain('Bronze');
    });

    it('should skip admin notification if ADMIN_EMAIL is not set', async () => {
      const env = getTestEnv(); // No ADMIN_EMAIL

      const referrer: Subscriber = {
        id: 'ref1',
        email: 'referrer@test.com',
        name: null,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: null,
        signup_page_slug: null,
        subscribed_at: Date.now(),
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: 'REFCODE1',
        referred_by: null,
        referral_count: 3,
      };

      const milestone: ReferralMilestone = {
        id: 'm1',
        threshold: 3,
        name: 'Bronze',
        description: null,
        reward_type: null,
        reward_value: null,
        created_at: Date.now(),
      };

      const result = await sendMilestoneNotifications(env as Env, referrer, milestone, 3);

      expect(result.adminNotified).toBe(false);
      expect(result.adminError).toBe('ADMIN_EMAIL not configured');
      expect(result.subscriberNotified).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle email send failure gracefully', async () => {
      mockSendEmail.mockResolvedValueOnce({ success: false, error: 'API error' });
      mockSendEmail.mockResolvedValueOnce({ success: true, id: 'test-id' });

      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      const referrer: Subscriber = {
        id: 'ref1',
        email: 'referrer@test.com',
        name: null,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: null,
        signup_page_slug: null,
        subscribed_at: Date.now(),
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: 'REFCODE1',
        referred_by: null,
        referral_count: 3,
      };

      const milestone: ReferralMilestone = {
        id: 'm1',
        threshold: 3,
        name: 'Bronze',
        description: null,
        reward_type: null,
        reward_value: null,
        created_at: Date.now(),
      };

      const result = await sendMilestoneNotifications(env as Env, referrer, milestone, 3);

      expect(result.adminNotified).toBe(false);
      expect(result.adminError).toBe('API error');
      expect(result.subscriberNotified).toBe(true);
    });

    it('should include different badge emoji based on milestone name', async () => {
      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      const referrer: Subscriber = {
        id: 'ref1',
        email: 'referrer@test.com',
        name: null,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: null,
        signup_page_slug: null,
        subscribed_at: Date.now(),
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: 'REFCODE1',
        referred_by: null,
        referral_count: 10,
      };

      const goldMilestone: ReferralMilestone = {
        id: 'm2',
        threshold: 10,
        name: 'Gold Champion',
        description: null,
        reward_type: 'badge',
        reward_value: null,
        created_at: Date.now(),
      };

      await sendMilestoneNotifications(env as Env, referrer, goldMilestone, 10);

      const subscriberCall = mockSendEmail.mock.calls.find((call) =>
        call[2].to === 'referrer@test.com'
      );
      // Gold should have gold emoji
      expect(subscriberCall?.[2].html).toContain('🥇');
    });
  });

  describe('handleConfirm with milestone notifications', () => {
    it('should send notification when milestone is achieved on confirmation', async () => {
      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      // Create referrer with 2 referrals (one more will reach Bronze at 3)
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
      ).bind('referrer', 'referrer@test.com', 'active', 'REFCODE1', 2).run();

      // Create pending subscriber with referred_by
      const confirmToken = 'test-confirm-token';
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, confirm_token, referred_by) VALUES (?, ?, ?, ?, ?)`
      ).bind('sub1', 'new@test.com', 'pending', confirmToken, 'referrer').run();

      // Create Bronze milestone at threshold 3
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name, reward_type, reward_value) VALUES (?, ?, ?, ?, ?)`
      ).bind('m1', 3, 'Bronze', 'badge', 'bronze-star').run();

      const request = new Request(`http://localhost/api/newsletter/confirm/${confirmToken}`, {
        method: 'GET',
      });

      await handleConfirm(request, env as Env, confirmToken);

      // Should have sent notifications (2 emails: admin + subscriber)
      expect(mockSendEmail).toHaveBeenCalledTimes(2);

      // Check admin was notified
      const adminCall = mockSendEmail.mock.calls.find((call) =>
        call[2].to === 'admin@test.com'
      );
      expect(adminCall).toBeDefined();
      expect(adminCall?.[2].subject).toContain('Bronze');

      // Check subscriber was notified
      const subscriberCall = mockSendEmail.mock.calls.find((call) =>
        call[2].to === 'referrer@test.com'
      );
      expect(subscriberCall).toBeDefined();
    });

    it('should not send notification if no new milestone is achieved', async () => {
      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      // Create referrer with 5 referrals (already past Bronze at 3)
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
      ).bind('referrer', 'referrer@test.com', 'active', 'REFCODE1', 5).run();

      // Create existing achievement for Bronze
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m1', 3, 'Bronze').run();

      await env.DB.prepare(
        `INSERT INTO referral_achievements (id, subscriber_id, milestone_id, achieved_at) VALUES (?, ?, ?, ?)`
      ).bind('ach1', 'referrer', 'm1', Math.floor(Date.now() / 1000)).run();

      // Create pending subscriber with referred_by
      const confirmToken = 'test-confirm-token';
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, confirm_token, referred_by) VALUES (?, ?, ?, ?, ?)`
      ).bind('sub1', 'new@test.com', 'pending', confirmToken, 'referrer').run();

      const request = new Request(`http://localhost/api/newsletter/confirm/${confirmToken}`, {
        method: 'GET',
      });

      await handleConfirm(request, env as Env, confirmToken);

      // No new achievement, so no notification should be sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should send multiple notifications when multiple milestones are achieved', async () => {
      const env = {
        ...getTestEnv(),
        ADMIN_EMAIL: 'admin@test.com',
      };

      // Create referrer with 2 referrals (one more will reach both Bronze at 3 and Silver at 3)
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
      ).bind('referrer', 'referrer@test.com', 'active', 'REFCODE1', 2).run();

      // Create pending subscriber with referred_by
      const confirmToken = 'test-confirm-token';
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, confirm_token, referred_by) VALUES (?, ?, ?, ?, ?)`
      ).bind('sub1', 'new@test.com', 'pending', confirmToken, 'referrer').run();

      // Create two milestones both achievable at 3 referrals
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m1', 1, 'Starter').run();

      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m2', 3, 'Bronze').run();

      const request = new Request(`http://localhost/api/newsletter/confirm/${confirmToken}`, {
        method: 'GET',
      });

      await handleConfirm(request, env as Env, confirmToken);

      // Should send notifications for both milestones (4 emails: 2 admin + 2 subscriber)
      expect(mockSendEmail).toHaveBeenCalledTimes(4);
    });
  });
});
