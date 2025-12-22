interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface ResendResponse {
  id?: string;
  error?: { message: string };
}

interface ResendBatchResponse {
  data?: { id: string }[];
  error?: { message: string };
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Don't retry on client errors (4xx), only on server errors (5xx)
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Exponential backoff
    if (attempt < maxRetries - 1) {
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function sendEmail(
  apiKey: string,
  from: string,
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    const result: ResendResponse = await response.json();

    if (!response.ok || result.error) {
      console.error('Resend API error:', {
        status: response.status,
        error: result.error,
        to: options.to,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to send email (HTTP ${response.status})`,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Email sending error:', {
      error: errorMessage,
      to: options.to,
    });
    return {
      success: false,
      error: `Email sending error: ${errorMessage}`,
    };
  }
}

interface BatchEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendBatchEmails(
  apiKey: string,
  from: string,
  emails: BatchEmailOptions[]
): Promise<{ success: boolean; sent: number; error?: string }> {
  // Resend batch API supports max 100 emails per request
  const MAX_BATCH_SIZE = 100;
  let totalSent = 0;

  try {
    for (let i = 0; i < emails.length; i += MAX_BATCH_SIZE) {
      const batch = emails.slice(i, i + MAX_BATCH_SIZE);

      const response = await fetchWithRetry('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          batch.map((email) => ({
            from,
            to: email.to,
            subject: email.subject,
            html: email.html,
          }))
        ),
      });

      if (!response.ok) {
        const result: ResendBatchResponse = await response.json();
        console.error('Resend batch API error:', {
          status: response.status,
          error: result.error,
          batchIndex: i,
          batchSize: batch.length,
        });
        return {
          success: false,
          sent: totalSent,
          error: result.error?.message || `Batch send failed (HTTP ${response.status})`,
        };
      }

      totalSent += batch.length;
    }

    return { success: true, sent: totalSent };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Batch email sending error:', {
      error: errorMessage,
      totalSent,
      totalEmails: emails.length,
    });
    return {
      success: false,
      sent: totalSent,
      error: `Batch email sending error: ${errorMessage}`,
    };
  }
}
