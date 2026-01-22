/**
 * Broadcast Sender - Campaign delivery via Resend Broadcast API
 *
 * This module orchestrates sending campaigns using Resend's Marketing API:
 * 1. Gets target subscribers (filtered by contact_list_id or all active)
 * 2. Ensures each subscriber has a Resend Contact (lazy sync)
 * 3. Adds new contacts to the permanent segment
 * 4. Sends Broadcast to the permanent segment
 * 5. Records delivery logs
 */

import type { Env, Campaign, Subscriber, BrandSettings, SequenceStep } from '../types';
import {
  ensureResendContact,
  addContactToDefaultSegment,
  createAndSendBroadcast,
  sleep,
  RESEND_RATE_LIMIT_DELAY_MS,
  type ResendMarketingConfig,
} from './resend-marketing';
import { recordDeliveryLogs, recordSequenceDeliveryLog } from './delivery';
import { renderEmail, getDefaultBrandSettings } from './templates';

export interface BroadcastSendResult {
  success: boolean;
  broadcastId?: string;
  sent: number;
  failed: number;
  error?: string;
  warnings?: string[];
  results: Array<{ email: string; success: boolean; contactId?: string; error?: string }>;
}

export interface SequenceBroadcastResult {
  success: boolean;
  broadcastId?: string;
  error?: string;
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
  try {
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
  } catch (error) {
    console.error('Failed to get target subscribers:', {
      campaignId: campaign.id,
      contactListId: campaign.contact_list_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to get target subscribers for campaign ${campaign.id}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Send a campaign via Resend Broadcast API.
 *
 * Flow:
 * 1. Get target subscribers
 * 2. Ensure Resend Contact for each (lazy sync)
 * 3. Add new contacts to permanent segment
 * 4. Create & Send Broadcast to permanent segment
 * 5. Record delivery logs
 */
export async function sendCampaignViaBroadcast(
  campaign: Campaign,
  env: Env
): Promise<BroadcastSendResult> {
  // Check for required config - use RESEND_SEGMENT_ID (preferred) or RESEND_AUDIENCE_ID (deprecated)
  let segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
  if (!segmentId) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: 'RESEND_SEGMENT_ID is not configured',
      results: [],
    };
  }

  // If campaign targets a specific list, use that list's Resend segment
  if (campaign.contact_list_id) {
    const list = await env.DB.prepare(
      'SELECT resend_segment_id FROM contact_lists WHERE id = ?'
    ).bind(campaign.contact_list_id).first<{ resend_segment_id: string | null }>();

    if (list?.resend_segment_id) {
      segmentId = list.resend_segment_id;
    }
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  const results: Array<{ email: string; success: boolean; contactId?: string; error?: string }> = [];
  const warnings: string[] = [];

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
  // Add new contacts to permanent segment (existing contacts should already be in segment)
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];

    // Add delay between requests (skip for first request)
    if (i > 0) {
      await sleep(RESEND_RATE_LIMIT_DELAY_MS);
    }

    const contactResult = await ensureResendContact(config, subscriber.email, subscriber.name);

    if (contactResult.success && contactResult.contactId) {
      results.push({
        email: subscriber.email,
        success: true,
        contactId: contactResult.contactId,
      });

      // If contact was just created (not existed), add to target segment
      if (!contactResult.existed) {
        await sleep(RESEND_RATE_LIMIT_DELAY_MS);
        await addContactToDefaultSegment(config, segmentId, contactResult.contactId);
      }
    } else {
      results.push({
        email: subscriber.email,
        success: false,
        error: contactResult.error || 'Failed to ensure contact',
      });
    }
  }

  // 3. Get brand settings and prepare email content
  let brandSettings = await env.DB.prepare(
    'SELECT * FROM brand_settings WHERE id = ?'
  ).bind('default').first<BrandSettings>();

  if (!brandSettings) {
    brandSettings = getDefaultBrandSettings();
  }

  const templateId = campaign.template_id || brandSettings.default_template_id;

  // Use first subscriber for template rendering (personalization would require individual sends)
  // Note: Using Resend's built-in unsubscribe URL for Broadcast API
  const firstSubscriber = subscribers[0];
  const html = renderEmail({
    templateId,
    content: campaign.content,
    subject: campaign.subject,
    brandSettings,
    subscriber: { name: firstSubscriber.name, email: firstSubscriber.email },
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    siteUrl: env.SITE_URL,
  });

  // 4. Create & Send Broadcast to permanent segment
  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: campaign.subject,
    html,
    name: `Campaign: ${campaign.subject}`,
    replyTo: env.REPLY_TO_EMAIL,
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

  // 5. Record delivery logs (best effort - don't fail if logging fails)
  const successfulSubscribers = subscribers.filter((sub) =>
    results.find((r) => r.email === sub.email && r.success)
  );

  const deliveryResults = successfulSubscribers.map((sub) => ({
    email: sub.email,
    success: true,
    resendId: broadcastResult.broadcastId,
  }));

  try {
    await recordDeliveryLogs(env, campaign.id, successfulSubscribers, deliveryResults);
  } catch (logError) {
    // Broadcast was already sent successfully - don't fail the operation
    // Just log the error for debugging
    console.error('Failed to record delivery logs after successful broadcast:', {
      campaignId: campaign.id,
      broadcastId: broadcastResult.broadcastId,
      subscriberCount: successfulSubscribers.length,
      error: logError instanceof Error ? logError.message : String(logError),
    });
    warnings.push(`Delivery log recording failed: ${logError instanceof Error ? logError.message : 'Unknown error'}`);
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return {
    success: true,
    broadcastId: broadcastResult.broadcastId,
    sent: successCount,
    failed: failedCount,
    results,
    ...(warnings.length > 0 && { warnings }),
  };
}

/**
 * Send a sequence step email to a single subscriber via Resend Broadcast API.
 *
 * Flow:
 * 1. Check for RESEND_SEGMENT_ID config
 * 2. Ensure Resend Contact (lazy sync)
 * 3. Add new contact to permanent segment (if just created)
 * 4. Create & Send Broadcast to permanent segment
 * 5. Record delivery log (success or failure)
 */
export async function sendSequenceStepViaBroadcast(
  env: Env,
  subscriber: Subscriber,
  step: SequenceStep,
  html: string
): Promise<SequenceBroadcastResult> {
  // 1. Check for required config - use RESEND_SEGMENT_ID (preferred) or RESEND_AUDIENCE_ID (deprecated)
  const segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
  if (!segmentId) {
    return {
      success: false,
      error: 'RESEND_SEGMENT_ID is not configured',
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  // 2. Ensure Resend Contact (lazy sync)
  const contactResult = await ensureResendContact(config, subscriber.email, subscriber.name);

  if (!contactResult.success) {
    // Record failure and return
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      status: 'failed',
      errorMessage: contactResult.error || 'Failed to ensure Resend contact',
    });

    return {
      success: false,
      error: `Failed to ensure Resend contact: ${contactResult.error}`,
    };
  }

  // Check if we have contactId (required for segment addition)
  if (!contactResult.contactId) {
    const errorMessage = contactResult.existed
      ? 'Contact exists in Resend but contactId not available for segment addition'
      : 'Contact created but no contactId returned';

    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      status: 'failed',
      errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }

  // 3. If contact was just created (not existed), add to default segment
  if (!contactResult.existed) {
    await addContactToDefaultSegment(config, segmentId, contactResult.contactId);
  }

  // 4. Create & Send Broadcast to permanent segment
  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: step.subject,
    html,
    name: `Sequence ${step.sequence_id} Step ${step.step_number}: ${step.subject}`,
    replyTo: env.REPLY_TO_EMAIL,
  });

  if (!broadcastResult.success) {
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      status: 'failed',
      errorMessage: broadcastResult.error || 'Failed to send broadcast',
    });

    return {
      success: false,
      broadcastId: broadcastResult.broadcastId,
      error: `Failed to send broadcast: ${broadcastResult.error}`,
    };
  }

  // 5. Record success delivery log (best effort - don't fail if logging fails)
  try {
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      resendId: broadcastResult.broadcastId,
      status: 'sent',
    });
  } catch (logError) {
    // Broadcast was already sent successfully - don't fail the operation
    // Just log the error for debugging
    console.error('Failed to record sequence delivery log after successful broadcast:', {
      sequenceId: step.sequence_id,
      subscriberId: subscriber.id,
      broadcastId: broadcastResult.broadcastId,
      error: logError instanceof Error ? logError.message : String(logError),
    });
  }

  return {
    success: true,
    broadcastId: broadcastResult.broadcastId,
  };
}
