import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb, getTestEnv } from './setup';
import worker from '../index';

// Helper to convert base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Test secret in proper whsec_ format (whsec_ + base64 encoded key)
const TEST_RAW_KEY = 'test_webhook_secret_key_bytes!';
const TEST_SECRET = 'whsec_' + btoa(TEST_RAW_KEY);

describe('Webhook Handler', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  async function createTestSignature(payload: string, timestamp: string, msgId: string = 'msg_test') {
    // Svix format: ${svix_id}.${svix_timestamp}.${payload}
    const signedPayload = `${msgId}.${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    // Decode the secret key (strip whsec_ prefix and decode base64)
    const keyBytes = base64ToBytes(TEST_SECRET.slice(6));

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    // Svix uses base64 encoding for signatures
    return bytesToBase64(new Uint8Array(signatureBytes));
  }

  it('should return 401 for invalid signature', async () => {
    const payload = JSON.stringify({ type: 'email.delivered', data: {} });

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,invalid',
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('should return 401 for missing signature headers', async () => {
    const payload = JSON.stringify({ type: 'email.delivered', data: {} });

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('should update delivery log on email.delivered event', async () => {
    // Setup: create campaign, subscriber, delivery_log
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const logId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`)
        .bind(campaignId, 'Test', 'Content', 'sent'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`)
        .bind(subscriberId, 'test@example.com', 'active'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(logId, campaignId, subscriberId, 'test@example.com', 'sent', resendId),
    ]);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: resendId,
        from: 'noreply@edgeshift.tech',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    // Mock env with test secret
    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    // Verify delivery log was updated
    const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
      .bind(logId).first();
    expect(log?.status).toBe('delivered');
    expect(log?.delivered_at).not.toBeNull();
  });

  it('should update delivery log on email.opened event', async () => {
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const logId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`)
        .bind(campaignId, 'Test', 'Content', 'sent'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`)
        .bind(subscriberId, 'test@example.com', 'active'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(logId, campaignId, subscriberId, 'test@example.com', 'delivered', resendId),
    ]);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.opened',
      created_at: new Date().toISOString(),
      data: {
        email_id: resendId,
        from: 'noreply@edgeshift.tech',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
      .bind(logId).first();
    expect(log?.status).toBe('opened');
    expect(log?.opened_at).not.toBeNull();
  });

  it('should update delivery log on email.clicked event', async () => {
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const logId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`)
        .bind(campaignId, 'Test', 'Content', 'sent'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`)
        .bind(subscriberId, 'test@example.com', 'active'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(logId, campaignId, subscriberId, 'test@example.com', 'opened', resendId),
    ]);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: resendId,
        from: 'noreply@edgeshift.tech',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        click: {
          link: 'https://example.com',
          timestamp: new Date().toISOString(),
        },
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
      .bind(logId).first();
    expect(log?.status).toBe('clicked');
    expect(log?.clicked_at).not.toBeNull();
  });

  it('should update delivery log on email.bounced event', async () => {
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const logId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`)
        .bind(campaignId, 'Test', 'Content', 'sent'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`)
        .bind(subscriberId, 'test@example.com', 'active'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(logId, campaignId, subscriberId, 'test@example.com', 'sent', resendId),
    ]);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: resendId,
        from: 'noreply@edgeshift.tech',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        bounce: {
          message: 'Mailbox does not exist',
        },
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
      .bind(logId).first();
    expect(log?.status).toBe('bounced');
    expect(log?.error_message).toBe('Mailbox does not exist');
  });

  it('should return 200 even if no matching delivery log found', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_nonexistent',
        from: 'noreply@edgeshift.tech',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: TEST_SECRET };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const result = await response.json() as { success: boolean; message?: string };
    expect(result.success).toBe(true);
  });
});
