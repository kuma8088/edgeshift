/**
 * A/B Test Complete Flow Integration Test
 *
 * Tests the entire A/B testing workflow from start to finish:
 * 1. Setup: Create 100 test subscribers
 * 2. Create A/B Campaign: Create campaign with A/B test enabled
 * 3. Execute Test Phase: Run sendAbTest to send to test groups
 * 4. Simulate Opens/Clicks: Update delivery logs with engagement data
 * 5. Verify Stats: Check ab_stats returns correct values
 * 6. Execute Winner Phase: Run sendAbTestWinner
 * 7. Verify Winner: Confirm correct variant wins
 * 8. Verify Delivery Logs: Check all logs have correct variants
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, getTestEnv } from './setup';
import { sendAbTest, sendAbTestWinner, getAbStats } from '../routes/ab-test-send';
import { calculateAbScore } from '../utils/ab-testing';
import type { Env, Campaign, Subscriber } from '../types';

describe('A/B Test Complete Flow', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  it('should execute complete A/B test flow with correct winner determination', async () => {
    const env = getTestEnv() as Env;

    // ================================================================
    // Step 1: Create 100 test subscribers
    // ================================================================
    const subscribers: Subscriber[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `sub-${i}`;
      const email = `test${i}@example.com`;
      const unsubscribeToken = `unsub-${i}`;

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).bind(id, email, `Test User ${i}`, unsubscribeToken, Math.floor(Date.now() / 1000)).run();

      subscribers.push({
        id,
        email,
        name: `Test User ${i}`,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: unsubscribeToken,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      });
    }

    // Verify subscribers were created
    const subCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM subscribers WHERE status = ?'
    ).bind('active').first<{ count: number }>();
    expect(subCount?.count).toBe(100);

    // ================================================================
    // Step 2: Create A/B test campaign
    // ================================================================
    const campaignId = 'campaign-ab-flow';
    const scheduledAt = Math.floor(Date.now() / 1000) + 4 * 60 * 60; // 4 hours from now

    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, scheduled_at, ab_test_enabled, ab_subject_b, ab_from_name_b, ab_wait_hours, created_at)
       VALUES (?, ?, ?, 'scheduled', ?, 1, ?, ?, 4, ?)`
    ).bind(
      campaignId,
      'Subject A - Original',
      '<p>Test content for A/B test</p>',
      scheduledAt,
      'Subject B - Variant',
      'Sender B',
      Math.floor(Date.now() / 1000)
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    expect(campaign).not.toBeNull();
    expect(campaign!.ab_test_enabled).toBe(1);
    expect(campaign!.ab_subject_b).toBe('Subject B - Variant');

    // ================================================================
    // Step 3: Execute Test Phase
    // ================================================================
    const mockSendEmail = vi.fn().mockImplementation(async (_env, to, _subject, _html) => {
      return { id: `resend-${Date.now()}-${to}` };
    });

    const testResult = await sendAbTest(env, campaign!, subscribers, mockSendEmail);

    // With 100 subscribers and 20% ratio (100-500 subscribers):
    // groupA: 10, groupB: 10, remaining: 80
    expect(testResult.groupASent).toBe(10);
    expect(testResult.groupBSent).toBe(10);
    expect(testResult.status).toBe('ab_testing');

    // Verify emails were sent to 20 subscribers
    expect(mockSendEmail).toHaveBeenCalledTimes(20);

    // ================================================================
    // Step 4: Get delivery logs to identify variant recipients
    // ================================================================
    const logsA = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'A' ORDER BY id`
    ).bind(campaignId).all();

    const logsB = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'B' ORDER BY id`
    ).bind(campaignId).all();

    expect(logsA.results?.length).toBe(10);
    expect(logsB.results?.length).toBe(10);

    // ================================================================
    // Step 5: Simulate opens/clicks
    // ================================================================
    const now = Math.floor(Date.now() / 1000);

    // Variant A: 5 opens (50%), 2 clicks (20%)
    // Opens for first 5 recipients
    for (let i = 0; i < 5; i++) {
      const log = logsA.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // Clicks for first 2 recipients (subset of opens)
    for (let i = 0; i < 2; i++) {
      const log = logsA.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // Variant B: 3 opens (30%), 1 click (10%)
    // Opens for first 3 recipients
    for (let i = 0; i < 3; i++) {
      const log = logsB.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // Click for first recipient (subset of opens)
    for (let i = 0; i < 1; i++) {
      const log = logsB.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // ================================================================
    // Step 6: Verify stats
    // ================================================================
    const stats = await getAbStats(env, campaignId);

    expect(stats).not.toBeNull();

    // Variant A stats
    expect(stats.variant_a.sent).toBe(10);
    expect(stats.variant_a.opened).toBe(5);
    expect(stats.variant_a.clicked).toBe(2);
    expect(stats.variant_a.open_rate).toBeCloseTo(0.5, 5);
    expect(stats.variant_a.click_rate).toBeCloseTo(0.2, 5);

    // Variant B stats
    expect(stats.variant_b.sent).toBe(10);
    expect(stats.variant_b.opened).toBe(3);
    expect(stats.variant_b.clicked).toBe(1);
    expect(stats.variant_b.open_rate).toBeCloseTo(0.3, 5);
    expect(stats.variant_b.click_rate).toBeCloseTo(0.1, 5);

    // Calculate expected scores
    // Score = open_rate * 0.7 + click_rate * 0.3
    // A: 0.5 * 0.7 + 0.2 * 0.3 = 0.35 + 0.06 = 0.41
    // B: 0.3 * 0.7 + 0.1 * 0.3 = 0.21 + 0.03 = 0.24
    const expectedScoreA = calculateAbScore(0.5, 0.2);
    const expectedScoreB = calculateAbScore(0.3, 0.1);

    expect(stats.variant_a.score).toBeCloseTo(expectedScoreA, 5);
    expect(stats.variant_b.score).toBeCloseTo(expectedScoreB, 5);
    expect(stats.variant_a.score).toBeGreaterThan(stats.variant_b.score);

    // ================================================================
    // Step 7: Execute Winner Phase
    // ================================================================
    const updatedCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    // Reset mock for winner phase
    mockSendEmail.mockClear();

    const winnerResult = await sendAbTestWinner(env, updatedCampaign!, mockSendEmail);

    // Variant A should win (higher score: 0.41 vs 0.24)
    expect(winnerResult.winner).toBe('A');
    expect(winnerResult.remainingSent).toBe(80);

    // Verify 80 emails were sent for remaining subscribers
    expect(mockSendEmail).toHaveBeenCalledTimes(80);

    // ================================================================
    // Step 8: Verify final delivery logs
    // ================================================================
    const allLogs = await env.DB.prepare(
      `SELECT ab_variant, COUNT(*) as count FROM delivery_logs WHERE campaign_id = ? GROUP BY ab_variant`
    ).bind(campaignId).all();

    const logCounts: Record<string, number> = {};
    for (const row of allLogs.results || []) {
      logCounts[row.ab_variant as string] = row.count as number;
    }

    // A: 10 (test phase) + 80 (winner phase) = 90
    // B: 10 (test phase only)
    expect(logCounts['A']).toBe(90);
    expect(logCounts['B']).toBe(10);

    // Total logs: 100
    const totalLogs = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM delivery_logs WHERE campaign_id = ?'
    ).bind(campaignId).first<{ count: number }>();
    expect(totalLogs?.count).toBe(100);

    // ================================================================
    // Step 9: Verify campaign final state
    // ================================================================
    const finalCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    expect(finalCampaign!.status).toBe('sent');
    expect(finalCampaign!.ab_winner).toBe('A');
    expect(finalCampaign!.recipient_count).toBe(100);

    // Verify winner used Subject A (original)
    const winnerSubjectCalls = mockSendEmail.mock.calls.filter(
      call => call[2] === 'Subject A - Original'
    );
    expect(winnerSubjectCalls.length).toBe(80);
  });

  it('should select B as winner when B performs better', async () => {
    const env = getTestEnv() as Env;

    // Create 100 subscribers
    const subscribers: Subscriber[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `sub-b-win-${i}`;
      const email = `testb${i}@example.com`;
      const unsubscribeToken = `unsub-b-${i}`;

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).bind(id, email, `B Test User ${i}`, unsubscribeToken, Math.floor(Date.now() / 1000)).run();

      subscribers.push({
        id,
        email,
        name: `B Test User ${i}`,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: unsubscribeToken,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      });
    }

    // Create A/B campaign
    const campaignId = 'campaign-b-wins';
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, scheduled_at, ab_test_enabled, ab_subject_b, ab_wait_hours)
       VALUES (?, ?, ?, 'scheduled', ?, 1, ?, 4)`
    ).bind(
      campaignId,
      'Subject A',
      '<p>Content</p>',
      Math.floor(Date.now() / 1000) + 3600,
      'Subject B - Better'
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    // Execute test phase
    const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-test' });
    await sendAbTest(env, campaign!, subscribers, mockSendEmail);

    // Get logs
    const logsA = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'A' ORDER BY id`
    ).bind(campaignId).all();

    const logsB = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'B' ORDER BY id`
    ).bind(campaignId).all();

    const now = Math.floor(Date.now() / 1000);

    // Variant A: 2 opens (20%), 0 clicks (0%)
    for (let i = 0; i < 2; i++) {
      const log = logsA.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // Variant B: 8 opens (80%), 4 clicks (40%)
    for (let i = 0; i < 8; i++) {
      const log = logsB.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, log.id).run();
    }
    for (let i = 0; i < 4; i++) {
      const log = logsB.results![i];
      await env.DB.prepare(
        `UPDATE delivery_logs SET clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, log.id).run();
    }

    // Verify B has higher score
    const stats = await getAbStats(env, campaignId);
    // A: 0.2 * 0.7 + 0 * 0.3 = 0.14
    // B: 0.8 * 0.7 + 0.4 * 0.3 = 0.56 + 0.12 = 0.68
    expect(stats.variant_b.score).toBeGreaterThan(stats.variant_a.score);

    // Execute winner phase
    mockSendEmail.mockClear();
    const updatedCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    const winnerResult = await sendAbTestWinner(env, updatedCampaign!, mockSendEmail);

    // B should win
    expect(winnerResult.winner).toBe('B');
    expect(winnerResult.remainingSent).toBe(80);

    // Verify campaign state
    const finalCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();
    expect(finalCampaign!.ab_winner).toBe('B');

    // Verify B's subject was used for remaining
    const subjectBCalls = mockSendEmail.mock.calls.filter(
      call => call[2] === 'Subject B - Better'
    );
    expect(subjectBCalls.length).toBe(80);
  });

  it('should select A on tie (A priority)', async () => {
    const env = getTestEnv() as Env;

    // Create 100 subscribers
    const subscribers: Subscriber[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `sub-tie-${i}`;
      const email = `tie${i}@example.com`;
      const unsubscribeToken = `unsub-tie-${i}`;

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).bind(id, email, `Tie User ${i}`, unsubscribeToken, Math.floor(Date.now() / 1000)).run();

      subscribers.push({
        id,
        email,
        name: `Tie User ${i}`,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: unsubscribeToken,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      });
    }

    // Create A/B campaign
    const campaignId = 'campaign-tie';
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, scheduled_at, ab_test_enabled, ab_subject_b, ab_wait_hours)
       VALUES (?, ?, ?, 'scheduled', ?, 1, ?, 4)`
    ).bind(
      campaignId,
      'Subject A',
      '<p>Content</p>',
      Math.floor(Date.now() / 1000) + 3600,
      'Subject B'
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    // Execute test phase
    const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-tie' });
    await sendAbTest(env, campaign!, subscribers, mockSendEmail);

    // Get logs
    const logsA = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'A' ORDER BY id`
    ).bind(campaignId).all();

    const logsB = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'B' ORDER BY id`
    ).bind(campaignId).all();

    const now = Math.floor(Date.now() / 1000);

    // Equal stats: Both get 5 opens, 2 clicks (50% open, 20% click)
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, logsA.results![i].id).run();

      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, status = 'opened' WHERE id = ?`
      ).bind(now, logsB.results![i].id).run();
    }

    for (let i = 0; i < 2; i++) {
      await env.DB.prepare(
        `UPDATE delivery_logs SET clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, logsA.results![i].id).run();

      await env.DB.prepare(
        `UPDATE delivery_logs SET clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, logsB.results![i].id).run();
    }

    // Verify scores are equal
    const stats = await getAbStats(env, campaignId);
    expect(stats.variant_a.score).toBeCloseTo(stats.variant_b.score, 5);

    // Execute winner phase
    mockSendEmail.mockClear();
    const updatedCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    const winnerResult = await sendAbTestWinner(env, updatedCampaign!, mockSendEmail);

    // A should win on tie
    expect(winnerResult.winner).toBe('A');

    // Verify campaign state
    const finalCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();
    expect(finalCampaign!.ab_winner).toBe('A');
  });

  it('should handle zero engagement (both variants have no opens/clicks)', async () => {
    const env = getTestEnv() as Env;

    // Create 100 subscribers
    const subscribers: Subscriber[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `sub-zero-${i}`;
      const email = `zero${i}@example.com`;
      const unsubscribeToken = `unsub-zero-${i}`;

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).bind(id, email, `Zero User ${i}`, unsubscribeToken, Math.floor(Date.now() / 1000)).run();

      subscribers.push({
        id,
        email,
        name: `Zero User ${i}`,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: unsubscribeToken,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      });
    }

    // Create A/B campaign
    const campaignId = 'campaign-zero';
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, scheduled_at, ab_test_enabled, ab_subject_b, ab_wait_hours)
       VALUES (?, ?, ?, 'scheduled', ?, 1, ?, 4)`
    ).bind(
      campaignId,
      'Subject A',
      '<p>Content</p>',
      Math.floor(Date.now() / 1000) + 3600,
      'Subject B'
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    // Execute test phase
    const mockSendEmail = vi.fn().mockResolvedValue({ id: 'resend-zero' });
    await sendAbTest(env, campaign!, subscribers, mockSendEmail);

    // No opens/clicks simulated - all logs remain as 'sent'

    // Verify zero engagement stats
    const stats = await getAbStats(env, campaignId);
    expect(stats.variant_a.opened).toBe(0);
    expect(stats.variant_a.clicked).toBe(0);
    expect(stats.variant_a.score).toBe(0);
    expect(stats.variant_b.opened).toBe(0);
    expect(stats.variant_b.clicked).toBe(0);
    expect(stats.variant_b.score).toBe(0);

    // Execute winner phase
    mockSendEmail.mockClear();
    const updatedCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    const winnerResult = await sendAbTestWinner(env, updatedCampaign!, mockSendEmail);

    // A should win (tie-breaker)
    expect(winnerResult.winner).toBe('A');

    // Verify campaign completed successfully
    const finalCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();
    expect(finalCampaign!.status).toBe('sent');
    expect(finalCampaign!.ab_winner).toBe('A');
  });

  it('should correctly use winner subject for remaining subscribers', async () => {
    const env = getTestEnv() as Env;

    // Create fewer subscribers for faster test
    const subscribers: Subscriber[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `sub-subj-${i}`;
      const email = `subj${i}@example.com`;

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, unsubscribe_token, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).bind(id, email, `Subject Test ${i}`, `unsub-subj-${i}`, Math.floor(Date.now() / 1000)).run();

      subscribers.push({
        id,
        email,
        name: `Subject Test ${i}`,
        status: 'active',
        confirm_token: null,
        unsubscribe_token: `unsub-subj-${i}`,
        signup_page_slug: null,
        subscribed_at: null,
        unsubscribed_at: null,
        created_at: Date.now(),
        referral_code: null,
        referred_by: null,
        referral_count: 0,
      });
    }

    const campaignId = 'campaign-subject-test';
    const subjectA = 'Original Subject A';
    const subjectB = 'Variant Subject B';

    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, scheduled_at, ab_test_enabled, ab_subject_b, ab_wait_hours)
       VALUES (?, ?, ?, 'scheduled', ?, 1, ?, 4)`
    ).bind(
      campaignId,
      subjectA,
      '<p>Content</p>',
      Math.floor(Date.now() / 1000) + 3600,
      subjectB
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    // Track subjects sent
    const sentSubjects: string[] = [];
    const mockSendEmail = vi.fn().mockImplementation(async (_env, _to, subject) => {
      sentSubjects.push(subject);
      return { id: `resend-${Date.now()}` };
    });

    await sendAbTest(env, campaign!, subscribers, mockSendEmail);

    // Verify test phase sent both subjects
    const testPhaseA = sentSubjects.filter(s => s === subjectA).length;
    const testPhaseB = sentSubjects.filter(s => s === subjectB).length;
    expect(testPhaseA).toBe(10);
    expect(testPhaseB).toBe(10);

    // Make B win with better engagement
    const logsB = await env.DB.prepare(
      `SELECT * FROM delivery_logs WHERE campaign_id = ? AND ab_variant = 'B'`
    ).bind(campaignId).all();

    const now = Math.floor(Date.now() / 1000);
    for (const log of logsB.results || []) {
      await env.DB.prepare(
        `UPDATE delivery_logs SET opened_at = ?, clicked_at = ?, status = 'clicked' WHERE id = ?`
      ).bind(now, now, log.id).run();
    }

    // Clear subjects and execute winner phase
    sentSubjects.length = 0;
    mockSendEmail.mockClear();

    const updatedCampaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    const winnerResult = await sendAbTestWinner(env, updatedCampaign!, mockSendEmail);
    expect(winnerResult.winner).toBe('B');

    // Verify all remaining emails used Subject B
    const winnerPhaseSubjects = sentSubjects.filter(s => s === subjectB).length;
    expect(winnerPhaseSubjects).toBe(80);
    expect(sentSubjects.every(s => s === subjectB)).toBe(true);
  });
});
