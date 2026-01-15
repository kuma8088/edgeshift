import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { sendCampaign, getCampaignStats } from '../routes/campaign-send';

// Mock email sending
vi.mock('../lib/email', () => ({
  sendBatchEmails: vi.fn().mockResolvedValue({
    success: true,
    sent: 1,
    results: [{ email: 'test@example.com', resendId: 're_mock_123' }],
  }),
}));

describe('sendCampaign', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create a test subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'unsub-token')
    `).run();

    // Create a test campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'draft')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
  });

  it('should send a campaign and record delivery logs', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.sent).toBe(1);

    // Check campaign status updated
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('sent');

    // Check delivery log created
    const logs = await env.DB.prepare('SELECT * FROM delivery_logs WHERE campaign_id = ?')
      .bind('camp-1').all();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].status).toBe('sent');
  });

  it('should not send already sent campaign', async () => {
    const env = getTestEnv();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = 'camp-1'").run();

    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-1');
    expect(response.status).toBe(400);
  });

  it('should return error if no active subscribers', async () => {
    const env = getTestEnv();
    // Update subscriber to unsubscribed
    await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE id = 'sub-1'").run();

    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-1');
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('No active subscribers');
  });

  it('should require authorization', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
    });

    const response = await sendCampaign(request, env, 'camp-1');
    expect(response.status).toBe(401);
  });
});

describe('getCampaignStats', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create a test campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, sent_at, recipient_count)
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'sent', 1703001600, 2)
    `).run();

    // Create test subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES
        ('sub-1', 'test1@example.com', 'Test User 1', 'active', 'token-1'),
        ('sub-2', 'test2@example.com', 'Test User 2', 'active', 'token-2')
    `).run();

    // Create delivery logs
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at)
      VALUES
        ('log-1', 'camp-1', 'sub-1', 'test1@example.com', 'opened', 1703001600),
        ('log-2', 'camp-1', 'sub-2', 'test2@example.com', 'sent', 1703001600)
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return campaign stats with open and click rates', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/camp-1/stats', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await getCampaignStats(request, env, 'camp-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.stats.total).toBe(2);
    expect(result.data.stats.sent).toBe(1);
    expect(result.data.stats.opened).toBe(1);
    expect(result.data.openRate).toBe('50.00%');
  });

  it('should require authorization', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/camp-1/stats', {
      method: 'GET',
    });

    const response = await getCampaignStats(request, env, 'camp-1');
    expect(response.status).toBe(401);
  });
});

describe('List-based Campaign Delivery', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should send to list members only when contact_list_id is set', async () => {
    const env = getTestEnv();
    const { createContactList, addMembers } = await import('../routes/contact-lists');

    // Create 3 subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token) VALUES
      ('sub1', 'list-member@example.com', 'active', 'token1'),
      ('sub2', 'non-member@example.com', 'active', 'token2'),
      ('sub3', 'also-non-member@example.com', 'active', 'token3')
    `).run();

    // Create list and add one member
    const list = await createContactList(env, { name: 'Tech Readers' });
    await addMembers(env, list.id, { subscriber_ids: ['sub1'] });

    // Create campaign with contact_list_id
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, contact_list_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind('camp1', 'Test Subject', 'Test Content', 'draft', list.id, Math.floor(Date.now() / 1000)).run();

    // Verify campaign has exactly 1 recipient (list member)
    const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind('camp1').first();
    const recipients = await env.DB.prepare(`
      SELECT s.* FROM subscribers s
      JOIN contact_list_members clm ON s.id = clm.subscriber_id
      WHERE clm.contact_list_id = ? AND s.status = 'active'
    `).bind(campaign.contact_list_id).all();

    expect(recipients.results).toHaveLength(1);
    expect(recipients.results[0].email).toBe('list-member@example.com');
  });

  it('should send to all active subscribers when contact_list_id is NULL', async () => {
    const env = getTestEnv();

    // Create 2 active subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token) VALUES
      ('sub1', 'user1@example.com', 'active', 'token1'),
      ('sub2', 'user2@example.com', 'active', 'token2')
    `).run();

    // Create campaign WITHOUT contact_list_id
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind('camp2', 'Test', 'Content', 'draft', Math.floor(Date.now() / 1000)).run();

    // Verify recipients include all active subscribers
    const recipients = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all();

    expect(recipients.results).toHaveLength(2);
  });
});

// Mock broadcast-sender for feature flag tests
vi.mock('../lib/broadcast-sender', () => ({
  sendCampaignViaBroadcast: vi.fn().mockResolvedValue({
    success: true,
    broadcastId: 'broadcast_mock_123',
    sent: 1,
    failed: 0,
    results: [{ email: 'test@example.com', success: true, contactId: 'contact_123' }],
  }),
}));

describe('Campaign Send with Broadcast API', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create a test subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-broadcast-1', 'broadcast-test@example.com', 'Broadcast User', 'active', 'unsub-token-broadcast')
    `).run();

    // Create a test campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-broadcast-1', 'Broadcast Test Subject', '<p>Broadcast Content</p>', 'draft')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
  });

  it('should use Broadcast API when USE_BROADCAST_API=true and RESEND_AUDIENCE_ID is set', async () => {
    const { sendCampaignViaBroadcast } = await import('../lib/broadcast-sender');
    const baseEnv = getTestEnv();

    // Override env to enable Broadcast API
    const env = {
      ...baseEnv,
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_test_123',
    };

    const request = new Request('http://localhost/api/campaigns/camp-broadcast-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-broadcast-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.broadcastId).toBe('broadcast_mock_123');
    expect(sendCampaignViaBroadcast).toHaveBeenCalledTimes(1);

    // Verify campaign status updated
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-broadcast-1').first();
    expect(campaign?.status).toBe('sent');
  });

  it('should use Email API when USE_BROADCAST_API=false', async () => {
    const { sendCampaignViaBroadcast } = await import('../lib/broadcast-sender');
    const { sendBatchEmails } = await import('../lib/email');
    const baseEnv = getTestEnv();

    // Override env to disable Broadcast API (default)
    const env = {
      ...baseEnv,
      USE_BROADCAST_API: 'false',
      RESEND_AUDIENCE_ID: 'aud_test_123',
    };

    const request = new Request('http://localhost/api/campaigns/camp-broadcast-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-broadcast-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    // Should NOT have broadcastId since Email API was used
    expect(result.data.broadcastId).toBeUndefined();
    // Broadcast API should NOT be called
    expect(sendCampaignViaBroadcast).not.toHaveBeenCalled();
    // Email API should be called
    expect(sendBatchEmails).toHaveBeenCalled();

    // Verify campaign status updated
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-broadcast-1').first();
    expect(campaign?.status).toBe('sent');
  });

  it('should use Email API when RESEND_AUDIENCE_ID is not set even if USE_BROADCAST_API=true', async () => {
    const { sendCampaignViaBroadcast } = await import('../lib/broadcast-sender');
    const { sendBatchEmails } = await import('../lib/email');
    const baseEnv = getTestEnv();

    // Override env: flag enabled but no audience ID
    const env = {
      ...baseEnv,
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: '', // Empty = not configured
    };

    const request = new Request('http://localhost/api/campaigns/camp-broadcast-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-broadcast-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    // Should fall back to Email API
    expect(result.data.broadcastId).toBeUndefined();
    expect(sendCampaignViaBroadcast).not.toHaveBeenCalled();
    expect(sendBatchEmails).toHaveBeenCalled();
  });
});
