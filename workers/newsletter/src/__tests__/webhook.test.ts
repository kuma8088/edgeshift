import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { verifyWebhookSignature } from '../lib/webhook';

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
