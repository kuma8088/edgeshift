import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { recordDeliveryLog, updateDeliveryStatus, getDeliveryLogs, findDeliveryLogByResendId } from '../lib/delivery';

describe('delivery logging', () => {
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
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'draft')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('recordDeliveryLog', () => {
    it('should record a successful delivery log', async () => {
      const env = getTestEnv();

      await recordDeliveryLog(env, {
        campaignId: 'camp-1',
        subscriberId: 'sub-1',
        email: 'test@example.com',
        status: 'sent',
        resendId: 'resend-123',
      });

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE campaign_id = ? AND subscriber_id = ?'
      ).bind('camp-1', 'sub-1').first();

      expect(log).toBeTruthy();
      expect(log?.email).toBe('test@example.com');
      expect(log?.status).toBe('sent');
      expect(log?.resend_id).toBe('resend-123');
      expect(log?.sent_at).toBeGreaterThan(0);
      expect(log?.error_message).toBeNull();
    });

    it('should record a failed delivery log with error message', async () => {
      const env = getTestEnv();

      await recordDeliveryLog(env, {
        campaignId: 'camp-1',
        subscriberId: 'sub-1',
        email: 'test@example.com',
        status: 'failed',
        errorMessage: 'Invalid email address',
      });

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE campaign_id = ? AND subscriber_id = ?'
      ).bind('camp-1', 'sub-1').first();

      expect(log).toBeTruthy();
      expect(log?.status).toBe('failed');
      expect(log?.error_message).toBe('Invalid email address');
      expect(log?.sent_at).toBeNull();
      expect(log?.resend_id).toBeNull();
    });
  });

  describe('updateDeliveryStatus', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      // Create initial delivery log
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id, sent_at)
        VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123', unixepoch())
      `).run();
    });

    it('should update delivery status to delivered', async () => {
      const env = getTestEnv();

      await updateDeliveryStatus(env, 'log-1', 'delivered');

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE id = ?'
      ).bind('log-1').first();

      expect(log?.status).toBe('delivered');
      expect(log?.delivered_at).toBeGreaterThan(0);
    });

    it('should update delivery status to opened', async () => {
      const env = getTestEnv();

      await updateDeliveryStatus(env, 'log-1', 'opened');

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE id = ?'
      ).bind('log-1').first();

      expect(log?.status).toBe('opened');
      expect(log?.opened_at).toBeGreaterThan(0);
    });

    it('should update delivery status to clicked', async () => {
      const env = getTestEnv();

      await updateDeliveryStatus(env, 'log-1', 'clicked');

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE id = ?'
      ).bind('log-1').first();

      expect(log?.status).toBe('clicked');
      expect(log?.clicked_at).toBeGreaterThan(0);
    });

    it('should update delivery status to bounced with error', async () => {
      const env = getTestEnv();

      await updateDeliveryStatus(env, 'log-1', 'bounced', 'Mailbox not found');

      const log = await env.DB.prepare(
        'SELECT * FROM delivery_logs WHERE id = ?'
      ).bind('log-1').first();

      expect(log?.status).toBe('bounced');
      expect(log?.error_message).toBe('Mailbox not found');
    });
  });

  describe('getDeliveryLogs', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      const now = Math.floor(Date.now() / 1000);

      // Create multiple delivery logs
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id, sent_at)
          VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123', ?)
        `).bind(now),
        env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id, sent_at, delivered_at)
          VALUES ('log-2', 'camp-1', 'sub-1', 'test2@example.com', 'delivered', 'resend-456', ?, ?)
        `).bind(now, now + 10),
        env.DB.prepare(`
          INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, error_message)
          VALUES ('log-3', 'camp-1', 'sub-1', 'test3@example.com', 'failed', 'Invalid email')
        `),
      ]);
    });

    it('should get all delivery logs for a campaign', async () => {
      const env = getTestEnv();

      const logs = await getDeliveryLogs(env, 'camp-1');

      expect(logs).toHaveLength(3);
      expect(logs[0].id).toBe('log-1');
      expect(logs[1].id).toBe('log-2');
      expect(logs[2].id).toBe('log-3');
    });

    it('should filter delivery logs by status', async () => {
      const env = getTestEnv();

      const logs = await getDeliveryLogs(env, 'camp-1', 'failed');

      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('log-3');
      expect(logs[0].status).toBe('failed');
      expect(logs[0].error_message).toBe('Invalid email');
    });

    it('should return empty array for non-existent campaign', async () => {
      const env = getTestEnv();

      const logs = await getDeliveryLogs(env, 'non-existent');

      expect(logs).toHaveLength(0);
    });
  });

  describe('findDeliveryLogByResendId', () => {
    it('should find delivery log by resend_id', async () => {
      const env = getTestEnv();

      // Setup: create a delivery log with resend_id
      const campaignId = crypto.randomUUID();
      const subscriberId = crypto.randomUUID();
      const resendId = 're_' + crypto.randomUUID();
      const testEmail = `test-${crypto.randomUUID()}@example.com`;

      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)
      `).bind(campaignId, 'Test', 'Content', 'sent').run();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)
      `).bind(subscriberId, testEmail, 'active').run();

      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), campaignId, subscriberId, testEmail, 'sent', resendId).run();

      const result = await findDeliveryLogByResendId(env, resendId);

      expect(result).not.toBeNull();
      expect(result?.resend_id).toBe(resendId);
    });

    it('should return null for non-existent resend_id', async () => {
      const env = getTestEnv();

      const result = await findDeliveryLogByResendId(env, 'non_existent');

      expect(result).toBeNull();
    });
  });
});
