import type { Env, BroadcastRequest, ApiResponse, Subscriber } from '../types';
import { isAuthorized } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';

function buildNewsletterEmail(
  content: string,
  unsubscribeUrl: string,
  siteUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #1e1e1e; font-size: 24px; margin: 0;">EdgeShift Newsletter</h1>
  </div>

  <div style="margin-bottom: 32px;">
    ${content}
  </div>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="${siteUrl}" style="color: #7c3aed;">EdgeShift</a><br>
    <a href="${unsubscribeUrl}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>
  `.trim();
}

export async function handleBroadcast(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization
  if (!isAuthorized(request, env)) {
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Unauthorized' },
      401
    );
  }

  try {
    const body = await request.json<BroadcastRequest>();
    const { subject, content } = body;

    // Validate required fields
    if (!subject || !content) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Subject and content are required' },
        400
      );
    }

    // Get active subscribers
    const result = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();

    const subscribers = result.results || [];

    if (subscribers.length === 0) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'No active subscribers' },
        400
      );
    }

    // Create campaign record
    const campaignId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES (?, ?, ?, 'draft')
    `).bind(campaignId, subject, content).run();

    // Prepare emails with unsubscribe links
    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject,
      html: buildNewsletterEmail(
        content,
        `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
        env.SITE_URL
      ),
    }));

    // Send batch emails
    const sendResult = await sendBatchEmails(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      emails
    );

    // Update campaign status based on result
    const now = Math.floor(Date.now() / 1000);
    const campaignStatus = sendResult.success ? 'sent' : 'failed';
    await env.DB.prepare(`
      UPDATE campaigns
      SET status = ?,
          sent_at = ?,
          recipient_count = ?
      WHERE id = ?
    `).bind(campaignStatus, now, sendResult.sent, campaignId).run();

    if (!sendResult.success) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: sendResult.error,
        data: { campaignId, sent: sendResult.sent, total: subscribers.length },
      });
    }

    return jsonResponse<ApiResponse>({
      success: true,
      data: {
        campaignId,
        sent: sendResult.sent,
        total: subscribers.length,
      },
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

export async function handleGetSubscribers(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization
  if (!isAuthorized(request, env)) {
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Unauthorized' },
      401
    );
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'active';

    const result = await env.DB.prepare(
      'SELECT id, email, name, status, subscribed_at, created_at FROM subscribers WHERE status = ?'
    ).bind(status).all();

    const total = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM subscribers WHERE status = ?'
    ).bind(status).first<{ count: number }>();

    return jsonResponse<ApiResponse>({
      success: true,
      data: {
        subscribers: result.results || [],
        total: total?.count || 0,
      },
    });
  } catch (error) {
    console.error('Get subscribers error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

export async function handleGetSubscriber(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  // Check authorization
  if (!isAuthorized(request, env)) {
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Unauthorized' },
      401
    );
  }

  try {
    const result = await env.DB.prepare(
      'SELECT id, email, name, status, subscribed_at, unsubscribed_at, created_at FROM subscribers WHERE id = ?'
    ).bind(id).first<Subscriber>();

    if (!result) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Subscriber not found' },
        404
      );
    }

    return jsonResponse<ApiResponse>({
      success: true,
      data: { subscriber: result },
    });
  } catch (error) {
    console.error('Get subscriber error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

export async function handleUpdateSubscriber(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  // Check authorization
  if (!isAuthorized(request, env)) {
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Unauthorized' },
      401
    );
  }

  try {
    const body = await request.json<{ name?: string; status?: string }>();
    const { name, status } = body;

    // Validate status if provided
    if (status && !['active', 'unsubscribed'].includes(status)) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Invalid status. Must be "active" or "unsubscribed"' },
        400
      );
    }

    // Check if subscriber exists
    const existing = await env.DB.prepare(
      'SELECT id FROM subscribers WHERE id = ?'
    ).bind(id).first();

    if (!existing) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Subscriber not found' },
        404
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name || null);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);

      // Update status-related timestamps
      if (status === 'active') {
        updates.push('subscribed_at = ?');
        values.push(Math.floor(Date.now() / 1000));
        updates.push('unsubscribed_at = NULL');
      } else if (status === 'unsubscribed') {
        updates.push('unsubscribed_at = ?');
        values.push(Math.floor(Date.now() / 1000));
      }
    }

    if (updates.length === 0) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'No fields to update' },
        400
      );
    }

    values.push(id);

    await env.DB.prepare(
      `UPDATE subscribers SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Fetch updated subscriber
    const updated = await env.DB.prepare(
      'SELECT id, email, name, status, subscribed_at, unsubscribed_at, created_at FROM subscribers WHERE id = ?'
    ).bind(id).first<Subscriber>();

    return jsonResponse<ApiResponse>({
      success: true,
      data: { subscriber: updated },
    });
  } catch (error) {
    console.error('Update subscriber error:', error);
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
