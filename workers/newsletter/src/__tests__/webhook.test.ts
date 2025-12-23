import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { verifyWebhookSignature } from '../lib/webhook';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret_key_12345';
  const payload = JSON.stringify({ type: 'email.delivered', data: {} });

  it('should return true for valid signature', async () => {
    // Create valid signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    const signature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const svixHeaders = {
      'svix-id': 'msg_test123',
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
