import type { Env, SubscribeRequest, ApiResponse, Subscriber } from '../types';
import { verifyTurnstileToken } from '../lib/turnstile';
import { sendEmail } from '../lib/email';
import { checkRateLimit } from '../lib/rate-limiter';
import { isDisposableEmail } from '../lib/disposable-emails';
import { STYLES, COLORS, wrapInEmailLayout } from '../lib/templates/styles';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

function generateToken(): string {
  return crypto.randomUUID();
}

/**
 * Find referrer by referral code
 * Returns the subscriber ID if the referral code is valid and belongs to an active subscriber
 */
async function findReferrer(
  db: D1Database,
  referralCode: string | undefined
): Promise<string | null> {
  if (!referralCode) return null;

  const referrer = await db.prepare(
    "SELECT id FROM subscribers WHERE referral_code = ? AND status = 'active'"
  ).bind(referralCode).first<{ id: string }>();

  return referrer?.id || null;
}

function buildConfirmationEmail(
  confirmUrl: string,
  siteUrl: string
): string {
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="${STYLES.heading(COLORS.text.primary)}">EdgeShift Newsletter</h1>
    </div>

    <div style="${STYLES.content}">
      <p style="${STYLES.paragraph}">EdgeShift Newsletter へのご登録ありがとうございます。</p>

      <p style="${STYLES.paragraph}">以下のボタンをクリックして、メールアドレスを確認してください：</p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${confirmUrl}" style="${STYLES.button(COLORS.accent)}">メールアドレスを確認する</a>
      </div>

      <p style="${STYLES.small(COLORS.text.secondary)}">このリンクは24時間有効です。</p>

      <p style="${STYLES.small(COLORS.text.secondary)}">もし心当たりがない場合は、このメールを無視してください。</p>
    </div>

    <div style="${STYLES.footerWrapper}">
      <p style="${STYLES.footer}">
        <a href="${siteUrl}" style="${STYLES.link(COLORS.accent)}">EdgeShift</a>
      </p>
    </div>
  `;

  return wrapInEmailLayout(content, COLORS.text.primary);
}

export async function handleSubscribe(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<SubscribeRequest>();
    const { email, name, turnstileToken, sequenceId, signupPageSlug, ref } = body;

    // Validate required fields
    if (!email || !turnstileToken) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Email and turnstile token are required' },
        400
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Invalid email format' },
        400
      );
    }

    // テストモード: test+* メールアドレスはTurnstileスキップ
    const isTestEmail = email.startsWith('test+') && email.endsWith('@edgeshift.tech');

    // Get IP address for rate limiting and Turnstile verification
    const ip = request.headers.get('CF-Connecting-IP') || undefined;

    if (!isTestEmail) {
      // Verify Turnstile token
      const turnstileResult = await verifyTurnstileToken(
        turnstileToken,
        env.TURNSTILE_SECRET_KEY,
        ip
      );

      if (!turnstileResult.success) {
        return jsonResponse<ApiResponse>(
          { success: false, error: 'Security verification failed' },
          400
        );
      }
    }

    // Rate limiting check (only if KV namespace is configured)
    if (ip && env.RATE_LIMIT_KV) {
      const rateLimitResult = await checkRateLimit(env.RATE_LIMIT_KV, ip);
      if (!rateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Too many requests. Please try again later.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '600', // 10 minutes in seconds
            },
          }
        );
      }
    }

    // Disposable email check
    if (isDisposableEmail(email)) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Please use a permanent email address' },
        400
      );
    }

    // Check for existing subscriber
    const existing = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE email = ?'
    ).bind(email).first<Subscriber>();

    if (existing) {
      if (existing.status === 'active') {
        return jsonResponse<ApiResponse>(
          { success: false, error: 'This email is already subscribed' },
          409
        );
      }

      if (existing.status === 'pending') {
        // Resend confirmation email
        const confirmToken = existing.confirm_token || generateToken();
        const confirmUrl = `${env.SITE_URL}/api/newsletter/confirm/${confirmToken}`;

        await env.DB.prepare(
          'UPDATE subscribers SET confirm_token = ?, signup_page_slug = ? WHERE id = ?'
        ).bind(confirmToken, signupPageSlug || null, existing.id).run();

        // Enroll in sequence if provided and not already enrolled
        if (sequenceId) {
          const existingEnrollment = await env.DB.prepare(
            'SELECT * FROM subscriber_sequences WHERE subscriber_id = ? AND sequence_id = ?'
          ).bind(existing.id, sequenceId).first();

          if (!existingEnrollment) {
            const enrollId = `enroll_${crypto.randomUUID()}`;
            const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(
              `INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, started_at)
               VALUES (?, ?, ?, ?)`
            ).bind(enrollId, existing.id, sequenceId, now).run();
          }
        }

        await sendEmail(
          env.RESEND_API_KEY,
          `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
          {
            to: email,
            subject: 'メールアドレスの確認 - EdgeShift Newsletter',
            html: buildConfirmationEmail(confirmUrl, env.SITE_URL),
          }
        );

        return jsonResponse<ApiResponse>({
          success: true,
          data: { message: 'Confirmation email resent' },
        });
      }

      // Resubscribe if previously unsubscribed
      if (existing.status === 'unsubscribed') {
        const confirmToken = generateToken();
        const unsubscribeToken = generateToken();
        const confirmUrl = `${env.SITE_URL}/api/newsletter/confirm/${confirmToken}`;

        await env.DB.prepare(`
          UPDATE subscribers
          SET status = 'pending',
              name = ?,
              confirm_token = ?,
              unsubscribe_token = ?,
              unsubscribed_at = NULL,
              signup_page_slug = ?
          WHERE id = ?
        `).bind(name || null, confirmToken, unsubscribeToken, signupPageSlug || null, existing.id).run();

        // Enroll in sequence if provided and not already enrolled
        if (sequenceId) {
          const existingEnrollment = await env.DB.prepare(
            'SELECT * FROM subscriber_sequences WHERE subscriber_id = ? AND sequence_id = ?'
          ).bind(existing.id, sequenceId).first();

          if (!existingEnrollment) {
            const enrollId = `enroll_${crypto.randomUUID()}`;
            const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(
              `INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, started_at)
               VALUES (?, ?, ?, ?)`
            ).bind(enrollId, existing.id, sequenceId, now).run();
          }
        }

        await sendEmail(
          env.RESEND_API_KEY,
          `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
          {
            to: email,
            subject: 'メールアドレスの確認 - EdgeShift Newsletter',
            html: buildConfirmationEmail(confirmUrl, env.SITE_URL),
          }
        );

        return jsonResponse<ApiResponse>({
          success: true,
          data: { message: 'Confirmation email sent' },
        });
      }
    }

    // Create new subscriber
    const id = generateToken();
    const confirmToken = generateToken();
    const unsubscribeToken = generateToken();
    const confirmUrl = `${env.SITE_URL}/api/newsletter/confirm/${confirmToken}`;

    // Find referrer if referral code is provided
    const referrerId = await findReferrer(env.DB, ref);

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, confirm_token, unsubscribe_token, signup_page_slug, referred_by)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(id, email, name || null, confirmToken, unsubscribeToken, signupPageSlug || null, referrerId).run();

    // Enroll in sequence if provided
    if (sequenceId) {
      const enrollId = `enroll_${crypto.randomUUID()}`;
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, started_at)
         VALUES (?, ?, ?, ?)`
      ).bind(enrollId, id, sequenceId, now).run();
    }

    // Send confirmation email
    const emailResult = await sendEmail(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      {
        to: email,
        subject: 'メールアドレスの確認 - EdgeShift Newsletter',
        html: buildConfirmationEmail(confirmUrl, env.SITE_URL),
      }
    );

    if (!emailResult.success) {
      // Rollback subscriber creation
      await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Failed to send confirmation email' },
        500
      );
    }

    return jsonResponse<ApiResponse>(
      { success: true, data: { message: 'Confirmation email sent' } },
      201
    );
  } catch (error) {
    console.error('Subscribe error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
