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

import type { Env, Campaign, Subscriber, BrandSettings, SequenceStep } from '../types';
import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
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
  const warnings: string[] = [];

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
    // Add delay between requests to respect Resend rate limit (2 req/sec)
    // Collect contactIds for segment addition (Resend API requires contactId, not email)
    const contactIds: string[] = [];

    for (let i = 0; i < subscribers.length; i++) {
      const subscriber = subscribers[i];

      // Add delay between requests (skip for first request)
      if (i > 0) {
        await sleep(RESEND_RATE_LIMIT_DELAY_MS);
      }

      const contactResult = await ensureResendContact(config, subscriber.email, subscriber.name);

      if (contactResult.success && contactResult.contactId) {
        // Contact available (new or existing with returned ID)
        contactIds.push(contactResult.contactId);
        results.push({
          email: subscriber.email,
          success: true,
          contactId: contactResult.contactId,
        });
      } else if (contactResult.success && contactResult.existed) {
        // Existing contact but Resend didn't return contactId in 409 response
        console.warn(`Contact exists but no contactId available for ${subscriber.email} - cannot add to segment`);
        results.push({
          email: subscriber.email,
          success: false,
          error: 'Contact exists in Resend but contactId not available for segment addition',
        });
      } else {
        // Failed to create/ensure contact
        console.warn(`Skipping subscriber ${subscriber.email}: ${contactResult.error}`);
        results.push({
          email: subscriber.email,
          success: false,
          error: contactResult.error,
        });
      }
    }

    if (contactIds.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: 'Failed to get contactIds for any subscribers (existing contacts cannot be added to segments)',
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

    // 4. Add contacts to Segment (using contactIds)
    const addResult = await addContactsToSegment(config, segmentId, contactIds);

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

    // 7. Record delivery logs (best effort - don't fail if logging fails)
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

    // 8. Cleanup: Delete temp Segment (best effort)
    if (segmentId) {
      const currentSegmentId = segmentId;
      const deleteResult = await deleteSegment(config, currentSegmentId).catch((e) => {
        console.error('Segment cleanup failed:', {
          segmentId: currentSegmentId,
          error: e instanceof Error ? e.message : String(e),
          note: 'Manual cleanup may be required via Resend dashboard',
        });
        return { success: false };
      });
      if (!deleteResult.success) {
        warnings.push(`Segment cleanup failed: ${currentSegmentId} - manual cleanup may be required`);
      }
      // Mark as cleaned up so finally block doesn't re-attempt
      segmentId = null;
    }

    return {
      success: true,
      broadcastId: broadcastResult.broadcastId,
      sent: successCount,
      failed: failedCount,
      results,
      ...(warnings.length > 0 && { warnings }),
    };
  } finally {
    // Cleanup on error path only: Delete temp Segment (best effort)
    // On success path, segmentId is set to null after cleanup
    if (segmentId) {
      await deleteSegment(config, segmentId).catch((e) => {
        console.error('Segment cleanup failed:', {
          segmentId,
          error: e instanceof Error ? e.message : String(e),
          note: 'Manual cleanup may be required via Resend dashboard',
        });
      });
    }
  }
}

/**
 * Send a sequence step email to a single subscriber via Resend Broadcast API.
 *
 * Flow:
 * 1. Check for RESEND_AUDIENCE_ID config
 * 2. Ensure Resend Contact (lazy sync)
 * 3. Create single-contact temp Segment
 * 4. Add contact to Segment
 * 5. Create & Send Broadcast
 * 6. Delete temp Segment (cleanup in finally)
 * 7. Record delivery log (success or failure)
 */
export async function sendSequenceStepViaBroadcast(
  env: Env,
  subscriber: Subscriber,
  step: SequenceStep,
  html: string
): Promise<SequenceBroadcastResult> {
  // 1. Check for required config
  if (!env.RESEND_AUDIENCE_ID) {
    return {
      success: false,
      error: 'RESEND_AUDIENCE_ID is not configured',
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
  };

  let segmentId: string | null = null;

  try {
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

    const contactId = contactResult.contactId;

    // 3. Create single-contact temp Segment
    const segmentName = `sequence-${step.sequence_id}-step-${step.step_number}-${subscriber.id.slice(0, 8)}`;
    const segmentResult = await createTempSegment(config, segmentName);

    if (!segmentResult.success || !segmentResult.segmentId) {
      await recordSequenceDeliveryLog(env, {
        sequenceId: step.sequence_id,
        sequenceStepId: step.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        emailSubject: step.subject,
        status: 'failed',
        errorMessage: segmentResult.error || 'Failed to create segment',
      });

      return {
        success: false,
        error: `Failed to create segment: ${segmentResult.error}`,
      };
    }

    segmentId = segmentResult.segmentId;

    // 4. Add contact to Segment (using contactId)
    const addResult = await addContactsToSegment(config, segmentId, [contactId]);

    if (!addResult.success) {
      await recordSequenceDeliveryLog(env, {
        sequenceId: step.sequence_id,
        sequenceStepId: step.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        emailSubject: step.subject,
        status: 'failed',
        errorMessage: `Failed to add contact to segment: ${addResult.errors.join(', ')}`,
      });

      return {
        success: false,
        error: `Failed to add contact to segment: ${addResult.errors.join(', ')}`,
      };
    }

    // 5. Create & Send Broadcast
    const broadcastResult = await createAndSendBroadcast(config, {
      segmentId,
      from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      subject: step.subject,
      html,
      name: `Sequence ${step.sequence_id} Step ${step.step_number}: ${step.subject}`,
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
  } finally {
    // 7. Cleanup: Delete temp Segment (best effort)
    if (segmentId) {
      const deleteResult = await deleteSegment(config, segmentId).catch((e) => {
        console.error('Sequence segment cleanup failed:', {
          segmentId,
          error: e instanceof Error ? e.message : String(e),
          note: 'Manual cleanup may be required via Resend dashboard',
        });
        return { success: false };
      });
      if (!deleteResult.success) {
        console.warn('Sequence segment cleanup incomplete - segment may remain in Resend:', segmentId);
      }
    }
  }
}
