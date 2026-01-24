import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { verifyWebhookSignature } from '../lib/webhook';
import { handleResendWebhook } from '../routes/webhook';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

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

// Helper to create a signed webhook request
async function createSignedWebhookRequest(event: any, secret: string): Promise<Request> {
  const payload = JSON.stringify(event);
  const encoder = new TextEncoder();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const msgId = `msg_${crypto.randomUUID()}`;
  const signedPayload = `${msgId}.${timestamp}.${payload}`;

  // Decode the secret key (strip whsec_ prefix and decode base64)
  const keyBytes = base64ToBytes(secret.slice(6));

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

  const signature = bytesToBase64(new Uint8Array(signatureBytes));

  return new Request('https://example.com/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body: payload,
  });
}

describe('verifyWebhookSignature', () => {
  // Use a proper whsec_ format secret (whsec_ + base64 encoded key)
  const rawKey = 'test_secret_key_12345_bytes!';
  const secret = 'whsec_' + btoa(rawKey);
  const payload = JSON.stringify({ type: 'email.delivered', data: {} });

  it('should return true for valid signature', async () => {
    // Create valid signature using HMAC-SHA256 with base64 encoding
    const encoder = new TextEncoder();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_test123';
    // Svix format: ${svix_id}.${svix_timestamp}.${payload}
    const signedPayload = `${msgId}.${timestamp}.${payload}`;

    // Decode the secret key (strip whsec_ prefix and decode base64)
    const keyBytes = base64ToBytes(secret.slice(6));

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
    const signature = bytesToBase64(new Uint8Array(signatureBytes));

    const svixHeaders = {
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(true);
  });

  it('should return false for invalid signature', async () => {
    const svixHeaders = {
      'svix-id': 'msg_test123',
      'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
      'svix-signature': 'v1,invalid_signature',
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(false);
  });

  it('should return false for expired timestamp (>5 minutes)', async () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6+ minutes ago
    const svixHeaders = {
      'svix-id': 'msg_test123',
      'svix-timestamp': oldTimestamp,
      'svix-signature': 'v1,some_signature',
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(false);
  });
});

describe('handleResendWebhook - click event recording', () => {
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
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should record click event when email.clicked with link', async () => {
    const env = getTestEnv();

    // Setup: create delivery log
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
    `).run();

    const event = {
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'resend-123',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        click: {
          link: 'https://example.com/clicked-link',
          timestamp: new Date().toISOString(),
        },
      },
    };

    const request = await createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
    const response = await handleResendWebhook(request, env);

    expect(response.status).toBe(200);

    // Verify click event was recorded
    const clickEvent = await env.DB.prepare(
      'SELECT * FROM click_events WHERE delivery_log_id = ?'
    ).bind('log-1').first();

    expect(clickEvent).toBeTruthy();
    expect(clickEvent?.clicked_url).toBe('https://example.com/clicked-link');
    expect(clickEvent?.subscriber_id).toBe('sub-1');
  });

  it('should still update status even if click.link is missing', async () => {
    const env = getTestEnv();

    // Setup
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
    `).run();

    const event = {
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'resend-123',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        // No click.link
      },
    };

    const request = await createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
    const response = await handleResendWebhook(request, env);

    expect(response.status).toBe(200);

    // Status should still be updated
    const log = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE id = ?'
    ).bind('log-1').first();

    expect(log?.status).toBe('clicked');
  });

  it('should record click event even for unsubscribe URLs (for troubleshooting)', async () => {
    const env = getTestEnv();

    // Setup: create delivery log
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-2', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-456')
    `).run();

    const event = {
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'resend-456',
        from: 'test@example.com',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        click: {
          link: 'https://unsubscribe.resend.com/?token=eyJhbGc...',
          timestamp: new Date().toISOString(),
        },
      },
    };

    const request = await createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
    const response = await handleResendWebhook(request, env);

    // Should return 200 OK (webhook processed)
    expect(response.status).toBe(200);

    // Should record click event even for unsubscribe URL (for troubleshooting)
    const clickEvents = await env.DB.prepare(
      'SELECT * FROM click_events WHERE clicked_url LIKE ?'
    ).bind('%unsubscribe.resend.com%').all();

    expect(clickEvents.results).toHaveLength(1);

    // Status should still be updated to 'clicked'
    const log = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE id = ?'
    ).bind('log-2').first();

    expect(log?.status).toBe('clicked');
  });

  it('should record click event for normal URLs', async () => {
    const env = getTestEnv();

    // Setup: create delivery log
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-3', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-789')
    `).run();

    const event = {
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'resend-789',
        from: 'test@example.com',
        to: ['test@example.com'],
        subject: 'Test',
        created_at: new Date().toISOString(),
        click: {
          link: 'https://example.com/article',
          timestamp: new Date().toISOString(),
        },
      },
    };

    const request = await createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
    const response = await handleResendWebhook(request, env);

    expect(response.status).toBe(200);

    const clickEvents = await env.DB.prepare(
      'SELECT * FROM click_events WHERE clicked_url = ?'
    ).bind('https://example.com/article').all();

    expect(clickEvents.results).toHaveLength(1);
  });
});
