interface SvixHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

const TOLERANCE_IN_SECONDS = 300; // 5 minutes

/**
 * Verify Resend webhook signature using Svix
 * @see https://resend.com/docs/dashboard/webhooks/verify-webhook-signature
 */
export async function verifyWebhookSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string
): Promise<boolean> {
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > TOLERANCE_IN_SECONDS) {
    return false;
  }

  // Parse signatures (can have multiple, space-separated with version prefix)
  // Format: "v1,signature" or "v1,sig1 v1,sig2"
  const signatureList = signatures.split(' ').map(s => s.trim());
  const v1Signatures = signatureList
    .filter(s => s.startsWith('v1,'))
    .map(s => s.slice(3));

  if (v1Signatures.length === 0) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  try {
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

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if any signature matches
    return v1Signatures.some(sig => sig === expectedSignature);
  } catch {
    return false;
  }
}
