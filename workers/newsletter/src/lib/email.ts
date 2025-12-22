interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface ResendResponse {
  id?: string;
  error?: { message: string };
}

export async function sendEmail(
  apiKey: string,
  from: string,
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
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
      return {
        success: false,
        error: result.error?.message || 'Failed to send email',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Email sending error',
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

      const response = await fetch('https://api.resend.com/emails/batch', {
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
        const result: ResendResponse = await response.json();
        return {
          success: false,
          sent: totalSent,
          error: result.error?.message || 'Batch send failed',
        };
      }

      totalSent += batch.length;
    }

    return { success: true, sent: totalSent };
  } catch (error) {
    return {
      success: false,
      sent: totalSent,
      error: 'Batch email sending error',
    };
  }
}
