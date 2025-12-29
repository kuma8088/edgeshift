import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import {
  handleGetReferralDashboard,
  handleGetMilestones,
  handleCreateMilestone,
  handleUpdateMilestone,
  handleDeleteMilestone,
  handleGetReferralStats,
} from '../routes/referral';
import { handleConfirm } from '../routes/confirm';
import type { Subscriber, ReferralMilestone } from '../types';

describe('Referral Program', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('Milestone CRUD', () => {
    it('should create a milestone', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/admin/milestones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          threshold: 5,
          name: 'First Badge',
          description: 'Get 5 referrals',
          reward_type: 'badge',
          reward_value: 'bronze',
        }),
      });

      const response = await handleCreateMilestone(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.threshold).toBe(5);
      expect(result.data.name).toBe('First Badge');
    });

    it('should reject duplicate threshold', async () => {
      const env = getTestEnv();

      // Create first milestone
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name, reward_type) VALUES (?, ?, ?, ?)`
      ).bind('m1', 5, 'First', 'badge').run();

      // Try to create with same threshold
      const request = new Request('http://localhost/api/admin/milestones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          threshold: 5,
          name: 'Duplicate',
        }),
      });

      const response = await handleCreateMilestone(request, env);
      expect(response.status).toBe(409);
    });

    it('should list all milestones', async () => {
      const env = getTestEnv();

      // Create milestones
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
        ).bind('m1', 3, 'Bronze'),
        env.DB.prepare(
          `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
        ).bind('m2', 10, 'Silver'),
      ]);

      const request = new Request('http://localhost/api/admin/milestones', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleGetMilestones(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      // Should be ordered by threshold
      expect(result.data[0].threshold).toBe(3);
      expect(result.data[1].threshold).toBe(10);
    });

    it('should update a milestone', async () => {
      const env = getTestEnv();

      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m1', 5, 'Original').run();

      const request = new Request('http://localhost/api/admin/milestones/m1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Updated',
          reward_type: 'discount',
        }),
      });

      const response = await handleUpdateMilestone(request, env, 'm1');
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated');
      expect(result.data.reward_type).toBe('discount');
    });

    it('should delete a milestone', async () => {
      const env = getTestEnv();

      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m1', 5, 'ToDelete').run();

      const request = new Request('http://localhost/api/admin/milestones/m1', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleDeleteMilestone(request, env, 'm1');
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Verify deletion
      const check = await env.DB.prepare(
        'SELECT * FROM referral_milestones WHERE id = ?'
      ).bind('m1').first();
      expect(check).toBeNull();
    });
  });

  describe('Referral Dashboard', () => {
    it('should return dashboard data for valid referral code', async () => {
      const env = getTestEnv();

      // Create referrer with referral code
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
      ).bind('ref1', 'referrer@test.com', 'active', 'ABCD1234', 5).run();

      // Create milestone and achievement
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name, reward_type, reward_value) VALUES (?, ?, ?, ?, ?)`
      ).bind('m1', 3, 'Bronze', 'badge', 'bronze').run();

      await env.DB.prepare(
        `INSERT INTO referral_achievements (id, subscriber_id, milestone_id, achieved_at) VALUES (?, ?, ?, ?)`
      ).bind('ach1', 'ref1', 'm1', Math.floor(Date.now() / 1000)).run();

      // Create next milestone
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m2', 10, 'Silver').run();

      const request = new Request('http://localhost/api/referral/dashboard/ABCD1234', {
        method: 'GET',
      });

      const response = await handleGetReferralDashboard(request, env, 'ABCD1234');
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.referral_code).toBe('ABCD1234');
      expect(result.data.referral_count).toBe(5);
      expect(result.data.achievements).toHaveLength(1);
      expect(result.data.achievements[0].milestone_name).toBe('Bronze');
      expect(result.data.next_milestone).toBeDefined();
      expect(result.data.next_milestone.name).toBe('Silver');
      expect(result.data.next_milestone.remaining).toBe(5);
    });

    it('should return 404 for invalid referral code', async () => {
      const env = getTestEnv();

      const request = new Request('http://localhost/api/referral/dashboard/INVALID', {
        method: 'GET',
      });

      const response = await handleGetReferralDashboard(request, env, 'INVALID');
      expect(response.status).toBe(404);
    });
  });

  describe('Referral Stats', () => {
    it('should return referral statistics', async () => {
      const env = getTestEnv();

      // Create subscribers with referral counts
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
        ).bind('s1', 'ref1@test.com', 'active', 'CODE1', 10),
        env.DB.prepare(
          `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
        ).bind('s2', 'ref2@test.com', 'active', 'CODE2', 5),
        env.DB.prepare(
          `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
        ).bind('s3', 'norefs@test.com', 'active', 'CODE3', 0),
      ]);

      const request = new Request('http://localhost/api/admin/referral-stats', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleGetReferralStats(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.total_referrals).toBe(15);
      expect(result.data.active_referrers).toBe(2);
      expect(result.data.top_referrers).toHaveLength(2);
      expect(result.data.top_referrers[0].email).toBe('ref1@test.com');
    });
  });

  describe('Confirm with Referral', () => {
    it('should generate referral code on confirmation', async () => {
      const env = getTestEnv();

      // Create pending subscriber
      const confirmToken = 'test-confirm-token';
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, confirm_token) VALUES (?, ?, ?, ?)`
      ).bind('sub1', 'new@test.com', 'pending', confirmToken).run();

      const request = new Request(`http://localhost/api/newsletter/confirm/${confirmToken}`, {
        method: 'GET',
      });

      const response = await handleConfirm(request, env, confirmToken);

      // Should redirect
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('/newsletter/confirmed');
      expect(location).toContain('ref=');

      // Verify subscriber was updated
      const subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE id = ?'
      ).bind('sub1').first<Subscriber>();

      expect(subscriber?.status).toBe('active');
      expect(subscriber?.referral_code).toBeDefined();
      expect(subscriber?.referral_code?.length).toBe(8);
    });

    it('should increment referrer count on confirmation', async () => {
      const env = getTestEnv();

      // Create referrer
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, referral_code, referral_count) VALUES (?, ?, ?, ?, ?)`
      ).bind('referrer', 'referrer@test.com', 'active', 'REFCODE1', 2).run();

      // Create pending subscriber with referred_by
      const confirmToken = 'test-confirm-token';
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, status, confirm_token, referred_by) VALUES (?, ?, ?, ?, ?)`
      ).bind('sub1', 'new@test.com', 'pending', confirmToken, 'referrer').run();

      // Create milestone for testing achievement
      await env.DB.prepare(
        `INSERT INTO referral_milestones (id, threshold, name) VALUES (?, ?, ?)`
      ).bind('m1', 3, 'Bronze').run();

      const request = new Request(`http://localhost/api/newsletter/confirm/${confirmToken}`, {
        method: 'GET',
      });

      await handleConfirm(request, env, confirmToken);

      // Verify referrer's count was incremented
      const referrer = await env.DB.prepare(
        'SELECT referral_count FROM subscribers WHERE id = ?'
      ).bind('referrer').first<{ referral_count: number }>();

      expect(referrer?.referral_count).toBe(3);

      // Verify achievement was created
      const achievement = await env.DB.prepare(
        'SELECT * FROM referral_achievements WHERE subscriber_id = ? AND milestone_id = ?'
      ).bind('referrer', 'm1').first();

      expect(achievement).toBeDefined();
    });
  });
});
