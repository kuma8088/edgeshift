interface SvixHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

const TOLERANCE_IN_SECONDS = 300; // 5 minutes

/**
 * Decode base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode Uint8Array to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
    // Svix secret format: "whsec_<base64_encoded_key>"
    // We need to decode the base64 key after stripping the prefix
    let keyBytes: Uint8Array;
    if (secret.startsWith('whsec_')) {
      keyBytes = base64ToBytes(secret.slice(6));
    } else {
      keyBytes = encoder.encode(secret);
    }

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

    // Svix signatures are base64 encoded, not hex
    const expectedSignature = bytesToBase64(new Uint8Array(signatureBytes));

    // Check if any signature matches
    return v1Signatures.some(sig => sig === expectedSignature);
  } catch {
    return false;
  }
}
