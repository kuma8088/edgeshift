interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
      }
    );

    const result: TurnstileResponse = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result['error-codes']?.join(', ') || 'Turnstile verification failed',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Turnstile verification error',
    };
  }
}
