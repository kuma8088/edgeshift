interface Env {
  RESEND_API_KEY: string;
  RECIPIENT_EMAIL: string;
  ALLOWED_ORIGIN: string;
}

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string; // honeypot
}

interface ValidationError {
  field: string;
  message: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(
  data: Record<string, unknown>,
  status: number,
  origin: string
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      ...CORS_HEADERS,
    },
  });
}

function handleCORS(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      ...CORS_HEADERS,
    },
  });
}

function parseFormData(formData: FormData): ContactFormData {
  return {
    name: (formData.get('name') as string) || '',
    email: (formData.get('email') as string) || '',
    subject: (formData.get('subject') as string) || '',
    message: (formData.get('message') as string) || '',
    website: (formData.get('website') as string) || undefined,
  };
}

function validateData(data: ContactFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'お名前は必須です' });
  } else if (data.name.length > 100) {
    errors.push({ field: 'name', message: 'お名前は100文字以内で入力してください' });
  }

  if (!data.email.trim()) {
    errors.push({ field: 'email', message: 'メールアドレスは必須です' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: 'email', message: '有効なメールアドレスを入力してください' });
  }

  if (!data.message.trim()) {
    errors.push({ field: 'message', message: 'メッセージは必須です' });
  } else if (data.message.length > 5000) {
    errors.push({ field: 'message', message: 'メッセージは5000文字以内で入力してください' });
  }

  if (data.subject && data.subject.length > 200) {
    errors.push({ field: 'subject', message: '件名は200文字以内で入力してください' });
  }

  return errors;
}

function generateEmailHtml(data: ContactFormData): string {
  const escapedName = escapeHtml(data.name);
  const escapedEmail = escapeHtml(data.email);
  const escapedSubject = escapeHtml(data.subject || '(件名なし)');
  const escapedMessage = escapeHtml(data.message).replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e1e1e; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
    .field { margin-bottom: 16px; }
    .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
    .value { margin-top: 4px; }
    .message-box { background: #fff; padding: 16px; border-radius: 4px; border-left: 4px solid #7c3aed; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">EdgeShift - お問い合わせ</h2>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">お名前</div>
        <div class="value">${escapedName}</div>
      </div>
      <div class="field">
        <div class="label">メールアドレス</div>
        <div class="value"><a href="mailto:${escapedEmail}">${escapedEmail}</a></div>
      </div>
      <div class="field">
        <div class="label">件名</div>
        <div class="value">${escapedSubject}</div>
      </div>
      <div class="field">
        <div class="label">メッセージ</div>
        <div class="message-box">${escapedMessage}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

async function sendEmail(env: Env, data: ContactFormData): Promise<void> {
  const subject = data.subject
    ? `[EdgeShift] ${data.subject}`
    : `[EdgeShift] お問い合わせ: ${data.name}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EdgeShift Contact <noreply@mail.edgeshift.tech>',
      to: env.RECIPIENT_EMAIL,
      reply_to: data.email,
      subject,
      html: generateEmailHtml(data),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Resend API error:', response.status, errorText);
    throw new Error(`Resend API error: ${response.status}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN;

    // Check origin (allow localhost for development)
    const isAllowedOrigin =
      origin === allowedOrigin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:');

    const responseOrigin = isAllowedOrigin ? origin : allowedOrigin;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(responseOrigin);
    }

    // Only POST allowed
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, responseOrigin);
    }

    try {
      const contentType = request.headers.get('Content-Type') || '';
      let data: ContactFormData;

      if (contentType.includes('application/json')) {
        const json = await request.json() as Record<string, string>;
        data = {
          name: json.name || '',
          email: json.email || '',
          subject: json.subject || '',
          message: json.message || '',
          website: json.website || undefined,
        };
      } else {
        const formData = await request.formData();
        data = parseFormData(formData);
      }

      // Honeypot check (silent success for bots)
      if (data.website) {
        console.log('Honeypot triggered, rejecting silently');
        return jsonResponse({ success: true }, 200, responseOrigin);
      }

      // Validation
      const errors = validateData(data);
      if (errors.length > 0) {
        return jsonResponse({ errors }, 400, responseOrigin);
      }

      // Send email
      await sendEmail(env, data);

      return jsonResponse({ success: true }, 200, responseOrigin);
    } catch (error) {
      console.error('Contact form error:', error);
      return jsonResponse(
        { error: '送信に失敗しました。しばらく経ってからお試しください。' },
        500,
        responseOrigin
      );
    }
  },
};
