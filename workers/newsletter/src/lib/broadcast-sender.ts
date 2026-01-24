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
  addContactsToSegment,
  createAndSendBroadcast,
  sleep,
  RESEND_RATE_LIMIT_DELAY_MS,
  type ResendMarketingConfig,
} from './resend-marketing';
import { recordDeliveryLogs, recordSequenceDeliveryLog } from './delivery';
import { renderEmailAsync, getDefaultBrandSettings } from './templates';

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

  const warnings: string[] = [];

  // If campaign targets a specific list, use that list's Resend segment
  if (campaign.contact_list_id) {
    const list = await env.DB.prepare(
      'SELECT resend_segment_id FROM contact_lists WHERE id = ?'
    ).bind(campaign.contact_list_id).first<{ resend_segment_id: string | null }>();

    if (!list) {
      console.error('Campaign references non-existent contact list:', {
        campaignId: campaign.id,
        contactListId: campaign.contact_list_id,
      });
      return {
        success: false,
        sent: 0,
        failed: 0,
        error: `Contact list not found: ${campaign.contact_list_id}`,
        results: [],
      };
    }

    if (list.resend_segment_id) {
      segmentId = list.resend_segment_id;
    } else {
      // Fallback to default but warn
      console.warn('Contact list has no Resend segment configured, using default:', {
        campaignId: campaign.id,
        contactListId: campaign.contact_list_id,
      });
      warnings.push(`Contact list ${campaign.contact_list_id} has no Resend segment, using default`);
    }
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

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

  // 2. Get brand settings and prepare email content
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
  const html = await renderEmailAsync({
    templateId,
    content: campaign.content,
    subject: campaign.subject,
    brandSettings,
    subscriber: { name: firstSubscriber.name, email: firstSubscriber.email },
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    siteUrl: env.SITE_URL,
    shortenUrls: {
      env,
      campaignId: campaign.id,
    },
  });

  // 4. Create & Send Broadcast to permanent segment
  // Use campaign's reply_to if set, otherwise fall back to env default
  const replyTo = campaign.reply_to || env.REPLY_TO_EMAIL;

  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: campaign.subject,
    html,
    name: `Campaign: ${campaign.subject}`,
    replyTo,
  });

  if (!broadcastResult.success) {
    return {
      success: false,
      sent: 0,
      failed: subscribers.length,
      error: `Failed to send broadcast: ${broadcastResult.error}`,
      results: subscribers.map((sub) => ({
        email: sub.email,
        success: false,
        error: broadcastResult.error,
      })),
    };
  }

  // 5. Record delivery logs (best effort - don't fail if logging fails)
  const deliveryResults = subscribers.map((sub) => ({
    email: sub.email,
    success: true,
    resendId: broadcastResult.broadcastId,
  }));

  try {
    await recordDeliveryLogs(env, campaign.id, subscribers, deliveryResults);
  } catch (logError) {
    // Broadcast was already sent successfully - don't fail the operation
    // Just log the error for debugging
    console.error('Failed to record delivery logs after successful broadcast:', {
      campaignId: campaign.id,
      broadcastId: broadcastResult.broadcastId,
      subscriberCount: subscribers.length,
      error: logError instanceof Error ? logError.message : String(logError),
    });
    warnings.push(`Delivery log recording failed: ${logError instanceof Error ? logError.message : 'Unknown error'}`);
  }

  // Build results array: all subscribers are considered successful if broadcast was sent
  const results = subscribers.map((sub) => ({
    email: sub.email,
    success: true,
  }));

  return {
    success: true,
    broadcastId: broadcastResult.broadcastId,
    sent: subscribers.length,
    failed: 0,
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
 * 4. Get sequence's reply_to address
 * 5. Create & Send Broadcast to permanent segment
 * 6. Record delivery log (success or failure)
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
    const addResult = await addContactsToSegment(config, segmentId, [contactResult.contactId]);
    if (!addResult.success || addResult.errors.length > 0) {
      const errorMsg = addResult.errors.join(', ');
      console.error('Failed to add contact to segment for sequence:', {
        sequenceId: step.sequence_id,
        stepNumber: step.step_number,
        email: subscriber.email,
        contactId: contactResult.contactId,
        segmentId,
        errors: addResult.errors,
      });
      // For sequences, this is critical - record failure
      await recordSequenceDeliveryLog(env, {
        sequenceId: step.sequence_id,
        sequenceStepId: step.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        emailSubject: step.subject,
        status: 'failed',
        errorMessage: `Failed to add contact to segment: ${errorMsg}`,
      });
      return {
        success: false,
        error: `Failed to add contact to segment: ${errorMsg}`,
      };
    }
  }

  // 4. Get sequence's reply_to address with error handling
  let replyTo = env.REPLY_TO_EMAIL;
  try {
    const sequence = await env.DB.prepare(
      'SELECT reply_to FROM sequences WHERE id = ?'
    ).bind(step.sequence_id).first<{ reply_to: string | null }>();

    if (sequence?.reply_to) {
      replyTo = sequence.reply_to;
    }
  } catch (dbError) {
    console.error('Failed to fetch sequence reply_to address:', {
      sequenceId: step.sequence_id,
      stepNumber: step.step_number,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    // Continue with default reply_to from env
  }

  // 5. Create & Send Broadcast to permanent segment
  const broadcastResult = await createAndSendBroadcast(config, {
    segmentId,
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    subject: step.subject,
    html,
    name: `Sequence ${step.sequence_id} Step ${step.step_number}: ${step.subject}`,
    replyTo,
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

  // 6. Record success delivery log (best effort - don't fail if logging fails)
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
