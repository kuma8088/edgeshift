/**
 * Broadcast Sender - Campaign delivery via Resend Broadcast API
 *
 * This module orchestrates sending campaigns using Resend's Marketing API:
 * 1. Gets target subscribers (filtered by contact_list_id or all active)
 * 2. Ensures each subscriber has a Resend Contact (lazy sync)
 * 3. Creates a temporary Segment for targeting
 * 4. Sends Broadcast to the Segment
 * 5. Cleans up the temporary Segment
 * 6. Records delivery logs
 */

import type { Env, Campaign, Subscriber, BrandSettings } from '../types';
import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
  type ResendMarketingConfig,
} from './resend-marketing';
import { recordDeliveryLogs } from './delivery';
import { renderEmail, getDefaultBrandSettings } from './templates';

export interface BroadcastSendResult {
  success: boolean;
  broadcastId?: string;
  sent: number;
  failed: number;
  error?: string;
  results: Array<{ email: string; success: boolean; contactId?: string; error?: string }>;
}

/**
 * Get target subscribers for a campaign.
 * If contact_list_id is set, get list members only.
 * Otherwise get all active subscribers.
 */
export async function getTargetSubscribers(
  campaign: Campaign,
  env: Env
): Promise<Subscriber[]> {
  let result;

  if (campaign.contact_list_id) {
    result = await env.DB.prepare(`
      SELECT s.* FROM subscribers s
      JOIN contact_list_members clm ON s.id = clm.subscriber_id
      WHERE clm.contact_list_id = ? AND s.status = 'active'
    `).bind(campaign.contact_list_id).all<Subscriber>();
  } else {
    result = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();
  }

  return result.results || [];
}

/**
 * Send a campaign via Resend Broadcast API.
 *
 * Flow:
 * 1. Get target subscribers
 * 2. Ensure Resend Contact for each (lazy sync)
 * 3. Create temp Segment
 * 4. Add contacts to Segment
 * 5. Create & Send Broadcast
 * 6. Delete temp Segment (cleanup)
 * 7. Record delivery logs
 */
export async function sendCampaignViaBroadcast(
  campaign: Campaign,
  env: Env
): Promise<BroadcastSendResult> {
  // Check for required config
  if (!env.RESEND_AUDIENCE_ID) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: 'RESEND_AUDIENCE_ID is not configured',
      results: [],
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  let segmentId: string | null = null;
  const results: Array<{ email: string; success: boolean; contactId?: string; error?: string }> = [];

  try {
    // 1. Get target subscribers
    const subscribers = await getTargetSubscribers(campaign, env);

    if (subscribers.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        error: 'No active subscribers',
        results: [],
      };
    }

    // 2. Ensure Resend Contact for each subscriber
    const successfulEmails: string[] = [];

    for (const subscriber of subscribers) {
      const contactResult = await ensureResendContact(config, subscriber.email, subscriber.name);

      if (contactResult.success) {
        successfulEmails.push(subscriber.email);
        results.push({
          email: subscriber.email,
          success: true,
          contactId: contactResult.contactId,
        });
      } else {
        // Skip subscriber but continue with others
        console.warn(`Skipping subscriber ${subscriber.email}: ${contactResult.error}`);
        results.push({
          email: subscriber.email,
          success: false,
          error: contactResult.error,
        });
      }
    }

    if (successfulEmails.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: 'Failed to create contacts for all subscribers',
        results,
      };
    }

    // 3. Create temp Segment
    const segmentResult = await createTempSegment(config, `campaign-${campaign.id}`);

    if (!segmentResult.success || !segmentResult.segmentId) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to create segment: ${segmentResult.error}`,
        results,
      };
    }

    segmentId = segmentResult.segmentId;

    // 4. Add contacts to Segment (using emails)
    const addResult = await addContactsToSegment(config, segmentId, successfulEmails);

    if (!addResult.success) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to add contacts to segment: ${addResult.errors.join(', ')}`,
        results,
      };
    }

    // 5. Get brand settings and prepare email content
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const templateId = campaign.template_id || brandSettings.default_template_id;

    // Use first subscriber for template rendering (personalization would require individual sends)
    const firstSubscriber = subscribers[0];
    const html = renderEmail({
      templateId,
      content: campaign.content,
      subject: campaign.subject,
      brandSettings,
      subscriber: { name: firstSubscriber.name, email: firstSubscriber.email },
      unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/{{unsubscribe_token}}`,
      siteUrl: env.SITE_URL,
    });

    // 6. Create & Send Broadcast
    const broadcastResult = await createAndSendBroadcast(config, {
      segmentId,
      from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      subject: campaign.subject,
      html,
      name: `Campaign: ${campaign.subject}`,
    });

    if (!broadcastResult.success) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to send broadcast: ${broadcastResult.error}`,
        results,
      };
    }

    // 7. Record delivery logs
    const successfulSubscribers = subscribers.filter((sub) =>
      results.find((r) => r.email === sub.email && r.success)
    );

    const deliveryResults = successfulSubscribers.map((sub) => ({
      email: sub.email,
      success: true,
      resendId: broadcastResult.broadcastId,
    }));

    await recordDeliveryLogs(env, campaign.id, successfulSubscribers, deliveryResults);

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      broadcastId: broadcastResult.broadcastId,
      sent: successCount,
      failed: failedCount,
      results,
    };
  } finally {
    // 8. Cleanup: Delete temp Segment (best effort)
    if (segmentId) {
      await deleteSegment(config, segmentId).catch((e) =>
        console.error('Segment cleanup failed:', e)
      );
    }
  }
}
