import type { Env, Campaign, Subscriber, BrandSettings } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';
import { sendCampaignViaBroadcast } from '../lib/broadcast-sender';
import { recordDeliveryLogs, getDeliveryStats } from '../lib/delivery';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmailAsync, getDefaultBrandSettings } from '../lib/templates';

export async function sendCampaign(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
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

    // Check if Broadcast API should be used
    const useBroadcastApi = env.USE_BROADCAST_API === 'true' && !!env.RESEND_AUDIENCE_ID;

    if (useBroadcastApi) {
      // Use Broadcast API
      const result = await sendCampaignViaBroadcast(campaign, env);

      if (!result.success) {
        // Update campaign status to failed
        await env.DB.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).bind(campaignId).run();

        return errorResponse(result.error || 'Broadcast send failed', 500);
      }

      // Update campaign status
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE campaigns
        SET status = 'sent', sent_at = ?, recipient_count = ?
        WHERE id = ?
      `).bind(now, result.sent, campaignId).run();

      // Get delivery stats
      const stats = await getDeliveryStats(env, campaignId);

      return successResponse({
        campaignId,
        sent: result.sent,
        total: result.sent + result.failed,
        broadcastId: result.broadcastId,
        stats,
      });
    }

    // Original Email API flow continues below...

    // Get active subscribers (list-based or broadcast)
    let subscribersResult;

    if (campaign.contact_list_id) {
      // List-based delivery: send only to members of the specified list
      subscribersResult = await env.DB.prepare(
        `SELECT s.* FROM subscribers s
         JOIN contact_list_members clm ON s.id = clm.subscriber_id
         WHERE clm.contact_list_id = ? AND s.status = 'active'`
      ).bind(campaign.contact_list_id).all<Subscriber>();
    } else {
      // Broadcast delivery: send to all active subscribers (default behavior)
      subscribersResult = await env.DB.prepare(
        "SELECT * FROM subscribers WHERE status = 'active'"
      ).all<Subscriber>();
    }

    const subscribers = subscribersResult.results || [];

    if (subscribers.length === 0) {
      return errorResponse('No active subscribers', 400);
    }

    // Get brand settings
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const templateId = campaign.template_id || brandSettings.default_template_id;

    // Prepare emails using template engine with URL shortening
    const emails = await Promise.all(
      subscribers.map(async (sub) => ({
        to: sub.email,
        subject: campaign.subject,
        html: await renderEmailAsync({
          templateId,
          content: campaign.content,
          subject: campaign.subject,
          brandSettings,
          subscriber: { name: sub.name, email: sub.email },
          unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
          siteUrl: env.SITE_URL,
          shortenUrls: {
            env,
            campaignId: campaign.id,
          },
        }),
      }))
    );

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Send campaign error:', {
      campaignId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return errorResponse(`Campaign send failed: ${errorMessage}`, 500);
  }
}

export async function getCampaignStats(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Get campaign stats error:', {
      campaignId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return errorResponse(`Failed to get campaign stats: ${errorMessage}`, 500);
  }
}
