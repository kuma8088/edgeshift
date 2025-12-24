import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { processScheduledCampaigns } from '../scheduled';

// Mock email sending
vi.mock('../lib/email', () => ({
  sendBatchEmails: vi.fn().mockResolvedValue({
    success: true,
    sent: 1,
    results: [{ email: 'test@example.com', resendId: 're_mock_123' }],
  }),
}));

describe('processScheduledCampaigns', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create a test subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'unsub-token')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
  });

  it('should process campaigns scheduled for now', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60; // 1 minute ago

    // Create a scheduled campaign that is due
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type)
      VALUES ('camp-1', 'Scheduled Campaign', '<p>Content</p>', 'scheduled', ?, 'none')
    `).bind(pastTime).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    // Verify campaign status updated to 'sent'
    const campaign = await env.DB.prepare('SELECT status, sent_at FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('sent');
    expect(campaign?.sent_at).toBeGreaterThan(0);

    // Verify delivery log created
    const logs = await env.DB.prepare('SELECT * FROM delivery_logs WHERE campaign_id = ?')
      .bind('camp-1').all();
    expect(logs.results).toHaveLength(1);
  });

  it('should not process campaigns scheduled for future', async () => {
    const env = getTestEnv();
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // Create a scheduled campaign for future
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type)
      VALUES ('camp-1', 'Future Campaign', '<p>Content</p>', 'scheduled', ?, 'none')
    `).bind(futureTime).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(0);

    // Verify campaign status is still 'scheduled'
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('scheduled');
  });

  it('should handle recurring daily campaigns', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Create a daily recurring campaign
    const scheduleConfig = JSON.stringify({ hour: 9, minute: 0 });
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config)
      VALUES ('camp-1', 'Daily Campaign', '<p>Content</p>', 'scheduled', ?, 'daily', ?)
    `).bind(pastTime, scheduleConfig).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);

    // Verify campaign is still 'scheduled' (not 'sent') for recurring
    const campaign = await env.DB.prepare('SELECT status, last_sent_at, scheduled_at FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('scheduled');
    expect(campaign?.last_sent_at).toBeGreaterThan(0);
    // Next scheduled time should be in the future (next day at 9:00)
    expect(campaign?.scheduled_at).toBeGreaterThan(now);
  });

  it('should handle recurring weekly campaigns', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Create a weekly recurring campaign (every Monday)
    const scheduleConfig = JSON.stringify({ hour: 10, minute: 0, dayOfWeek: 1 });
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config)
      VALUES ('camp-1', 'Weekly Campaign', '<p>Content</p>', 'scheduled', ?, 'weekly', ?)
    `).bind(pastTime, scheduleConfig).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);

    // Verify campaign is still 'scheduled' for recurring
    const campaign = await env.DB.prepare('SELECT status, last_sent_at, scheduled_at FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('scheduled');
    expect(campaign?.last_sent_at).toBeGreaterThan(0);
    // Next scheduled time should be in the future (next week)
    expect(campaign?.scheduled_at).toBeGreaterThan(now);
  });

  it('should handle recurring monthly campaigns', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Create a monthly recurring campaign (1st of month)
    const scheduleConfig = JSON.stringify({ hour: 9, minute: 0, dayOfMonth: 1 });
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config)
      VALUES ('camp-1', 'Monthly Campaign', '<p>Content</p>', 'scheduled', ?, 'monthly', ?)
    `).bind(pastTime, scheduleConfig).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);

    // Verify campaign is still 'scheduled' for recurring
    const campaign = await env.DB.prepare('SELECT status, last_sent_at, scheduled_at FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('scheduled');
    expect(campaign?.last_sent_at).toBeGreaterThan(0);
    // Next scheduled time should be in the future (next month)
    expect(campaign?.scheduled_at).toBeGreaterThan(now);
  });

  it('should continue processing even if one campaign fails', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Create two scheduled campaigns
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type)
      VALUES
        ('camp-1', 'Campaign 1', '<p>Content</p>', 'scheduled', ?, 'none'),
        ('camp-2', 'Campaign 2', '<p>Content</p>', 'scheduled', ?, 'none')
    `).bind(pastTime, pastTime).run();

    // Mock email to fail for first campaign, succeed for second
    const { sendBatchEmails } = await import('../lib/email');
    vi.mocked(sendBatchEmails)
      .mockResolvedValueOnce({ success: false, sent: 0, error: 'Failed to send', results: [] })
      .mockResolvedValueOnce({ success: true, sent: 1, results: [{ email: 'test@example.com', resendId: 're_mock_456' }] });

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    // Verify first campaign status is 'failed'
    const campaign1 = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign1?.status).toBe('failed');

    // Verify second campaign status is 'sent'
    const campaign2 = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-2').first();
    expect(campaign2?.status).toBe('sent');
  });

  it('should not process campaigns with status other than scheduled', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Create campaigns with different statuses
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type)
      VALUES
        ('camp-1', 'Draft Campaign', '<p>Content</p>', 'draft', ?, 'none'),
        ('camp-2', 'Sent Campaign', '<p>Content</p>', 'sent', ?, 'none'),
        ('camp-3', 'Failed Campaign', '<p>Content</p>', 'failed', ?, 'none')
    `).bind(pastTime, pastTime, pastTime).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(0);
  });

  it('should handle campaigns with no active subscribers', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);
    const pastTime = now - 60;

    // Unsubscribe the only subscriber
    await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE id = 'sub-1'").run();

    // Create a scheduled campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type)
      VALUES ('camp-1', 'Campaign', '<p>Content</p>', 'scheduled', ?, 'none')
    `).bind(pastTime).run();

    const result = await processScheduledCampaigns(env);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);

    // Campaign should be marked as failed
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('failed');
  });
});
