import type { Env, Campaign, Subscriber, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';
import { recordDeliveryLogs, getDeliveryStats } from '../lib/delivery';
import { errorResponse, successResponse } from '../lib/response';

/**
 * Convert plain text URLs to clickable links
 * Matches URLs starting with http:// or https://
 * Uses negative lookbehind to avoid matching URLs already inside HTML attributes
 */
function linkifyUrls(text: string): string {
  // Negative lookbehind (?<!...) to skip URLs inside HTML attributes like href="..." or src="..."
  // Also skip URLs that are already inside <a> tags
  const urlRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/[^\s<>"]+)(?![^<]*<\/a>)/g;
  return text.replace(urlRegex, '<a href="$1" style="color: #7c3aed;">$1</a>');
}

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
    ${linkifyUrls(content)}
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

export async function sendCampaign(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // Get campaign
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    if (campaign.status === 'sent') {
      return errorResponse('Campaign already sent', 400);
    }

    // Get active subscribers
    const subscribersResult = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();

    const subscribers = subscribersResult.results || [];

    if (subscribers.length === 0) {
      return errorResponse('No active subscribers', 400);
    }

    // Prepare emails
    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject: campaign.subject,
      html: buildNewsletterEmail(
        campaign.content,
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

    // Record delivery logs with resend IDs from batch send results
    const resultMap = new Map(sendResult.results.map(r => [r.email, r]));
    const deliveryResults = subscribers.map((sub) => {
      const result = resultMap.get(sub.email);
      return {
        email: sub.email,
        success: sendResult.success && !result?.error,
        resendId: result?.resendId,
        error: result?.error || sendResult.error,
      };
    });
    await recordDeliveryLogs(env, campaignId, subscribers, deliveryResults);

    // Update campaign status
    const now = Math.floor(Date.now() / 1000);
    const status = sendResult.success ? 'sent' : 'failed';
    await env.DB.prepare(`
      UPDATE campaigns
      SET status = ?, sent_at = ?, recipient_count = ?
      WHERE id = ?
    `).bind(status, now, sendResult.sent, campaignId).run();

    // Get delivery stats
    const stats = await getDeliveryStats(env, campaignId);

    return successResponse({
      campaignId,
      sent: sendResult.sent,
      total: subscribers.length,
      stats,
    });
  } catch (error) {
    console.error('Send campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getCampaignStats(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    const stats = await getDeliveryStats(env, campaignId);

    return successResponse({
      campaign,
      stats,
      openRate: stats.total > 0 ? (stats.opened / stats.total * 100).toFixed(2) + '%' : '0%',
      clickRate: stats.total > 0 ? (stats.clicked / stats.total * 100).toFixed(2) + '%' : '0%',
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return errorResponse('Internal server error', 500);
  }
}
