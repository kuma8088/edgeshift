import type { Env, BrandSettings, Subscriber, SequenceStep } from '../types';
import { sendEmail } from './email';
import { recordSequenceDeliveryLog } from './delivery';
import { renderEmail, getDefaultBrandSettings } from './templates';
import { sendSequenceStepViaBroadcast } from './broadcast-sender';

interface PendingSequenceEmail {
  subscriber_sequence_id: string;
  subscriber_id: string;
  email: string;
  name: string | null;
  unsubscribe_token: string;
  subject: string;
  content: string;
  step_number: number;
  step_id: string;
  sequence_id: string;
  current_step: number;
  started_at: number;
  default_send_time: string;
  delay_time: string | null;
  delay_minutes: number | null;
  template_id: string | null;
}

const JST_OFFSET_SECONDS = 9 * 60 * 60; // +9 hours in seconds

/**
 * Calculate the scheduled send time in Unix timestamp using delay_days logic
 * @param startedAt - When the subscriber enrolled (Unix timestamp)
 * @param delayDays - Days to wait
 * @param sendTime - Time to send in "HH:MM" format (JST)
 * @returns Unix timestamp of scheduled send time
 */
function calculateScheduledTime(
  startedAt: number,
  delayDays: number,
  sendTime: string
): number {
  // Calculate the target date (started_at + delay_days)
  const targetDateUtc = startedAt + delayDays * 86400;

  // Convert to JST midnight of that day
  // 1. Add JST offset to get JST time
  // 2. Floor to day boundary
  // 3. Subtract JST offset to get back to UTC
  const jstTime = targetDateUtc + JST_OFFSET_SECONDS;
  const jstMidnight = Math.floor(jstTime / 86400) * 86400;
  const utcMidnightOfJstDay = jstMidnight - JST_OFFSET_SECONDS;

  // Parse send time
  const [hours, minutes] = sendTime.split(':').map(Number);

  // Add send time (in seconds) - this is JST time, so we add it directly
  // Then subtract JST offset to convert to UTC
  const scheduledTime = utcMidnightOfJstDay + hours * 3600 + minutes * 60;

  return scheduledTime;
}

/**
 * Calculate the scheduled send time using delay_minutes logic
 * @param baseTime - Base timestamp (started_at for step 1, previous step's sent_at for step 2+)
 * @param delayMinutes - Minutes to wait from base time
 * @returns Unix timestamp of scheduled send time
 */
function calculateScheduledTimeByMinutes(
  baseTime: number,
  delayMinutes: number
): number {
  return baseTime + delayMinutes * 60;
}

/**
 * Process all due sequence emails
 * This function is called by the scheduled handler
 */
export async function processSequenceEmails(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  try {
    // Find subscribers who need to receive sequence emails
    // They should be:
    // 1. Not completed (completed_at IS NULL)
    // 2. Active subscribers
    // 3. In active sequences
    // 4. Due for next step (based on started_at + delay_days or delay_minutes)
    const pendingEmails = await env.DB.prepare(`
      SELECT
        ss.id as subscriber_sequence_id,
        ss.subscriber_id,
        ss.current_step,
        ss.started_at,
        s.email,
        s.name,
        s.unsubscribe_token,
        step.id as step_id,
        step.subject,
        step.content,
        step.step_number,
        step.sequence_id,
        step.delay_days,
        step.delay_time,
        step.delay_minutes,
        step.template_id,
        seq.default_send_time
      FROM subscriber_sequences ss
      JOIN subscribers s ON s.id = ss.subscriber_id
      JOIN sequences seq ON seq.id = ss.sequence_id
      JOIN sequence_steps step ON step.sequence_id = ss.sequence_id AND step.is_enabled = 1
      WHERE ss.completed_at IS NULL
      AND s.status = 'active'
      AND seq.is_active = 1
      AND step.step_number = ss.current_step + 1
    `).all<PendingSequenceEmail & { delay_days: number }>();

    const pending = pendingEmails.results || [];
    console.log(`Found ${pending.length} potential sequence email(s), checking scheduled times...`);

    // Get brand settings for template rendering
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    for (const email of pending) {
      let scheduledAt: number;

      // Check if delay_minutes is set (including 0 for immediate)
      if (email.delay_minutes !== null && email.delay_minutes !== undefined) {
        // delay_minutes mode: calculate based on minutes from base time
        if (email.step_number === 1) {
          // Step 1: base time is started_at
          scheduledAt = calculateScheduledTimeByMinutes(email.started_at, email.delay_minutes);
        } else {
          // Step 2+: base time is previous step's sent_at from delivery_logs
          const prevStepLog = await env.DB.prepare(`
            SELECT sent_at FROM delivery_logs
            WHERE subscriber_id = ? AND sequence_id = ? AND sequence_step_id IN (
              SELECT id FROM sequence_steps WHERE sequence_id = ? AND step_number = ?
            )
            ORDER BY sent_at DESC LIMIT 1
          `).bind(
            email.subscriber_id,
            email.sequence_id,
            email.sequence_id,
            email.step_number - 1
          ).first<{ sent_at: number }>();

          if (!prevStepLog?.sent_at) {
            // Previous step not sent yet, skip
            console.log(`Skipping ${email.email} step ${email.step_number}: previous step not sent yet`);
            continue;
          }
          scheduledAt = calculateScheduledTimeByMinutes(prevStepLog.sent_at, email.delay_minutes);
        }
      } else {
        // Traditional delay_days mode
        const sendTime = email.delay_time ?? email.default_send_time;
        scheduledAt = calculateScheduledTime(
          email.started_at,
          email.delay_days,
          sendTime
        );
      }

      // Skip if not yet time to send
      if (now < scheduledAt) {
        console.log(`Skipping ${email.email} step ${email.step_number}: scheduled for ${new Date(scheduledAt * 1000).toISOString()}`);
        continue;
      }

      console.log(`Sending sequence email to ${email.email}, step ${email.step_number}`);

      // Determine template: step template_id > brand default > 'simple'
      const templateId = email.template_id || brandSettings.default_template_id || 'simple';
      const unsubscribeUrl = `${env.SITE_URL}/api/newsletter/unsubscribe/${email.unsubscribe_token}`;

      // Render HTML content once (used by both Email API and Broadcast API)
      const html = renderEmail({
        templateId,
        content: email.content,
        subject: email.subject,
        brandSettings,
        subscriber: { name: email.name, email: email.email },
        unsubscribeUrl,
        siteUrl: env.SITE_URL,
      });

      // Check if Broadcast API should be used
      const useBroadcastApi = env.USE_BROADCAST_API === 'true' && !!env.RESEND_AUDIENCE_ID;

      let sendSuccess = false;

      if (useBroadcastApi) {
        // Use Broadcast API for sequence step
        // Construct Subscriber object from query data
        const subscriber: Subscriber = {
          id: email.subscriber_id,
          email: email.email,
          name: email.name,
          status: 'active',
          confirm_token: null,
          unsubscribe_token: email.unsubscribe_token,
          signup_page_slug: null,
          subscribed_at: null,
          unsubscribed_at: null,
          created_at: 0,
          referral_code: null,
          referred_by: null,
          referral_count: 0,
        };

        // Construct SequenceStep object from query data
        const step: SequenceStep = {
          id: email.step_id,
          sequence_id: email.sequence_id,
          step_number: email.step_number,
          delay_days: 0,
          subject: email.subject,
          content: email.content,
          template_id: email.template_id,
          is_enabled: 1,
          created_at: 0,
        };

        const broadcastResult = await sendSequenceStepViaBroadcast(env, subscriber, step, html);
        sendSuccess = broadcastResult.success;

        // sendSequenceStepViaBroadcast already records delivery logs
        if (!sendSuccess) {
          console.error(`Failed to send sequence email via Broadcast API to ${email.email}:`, broadcastResult.error);
        }
      } else {
        // Use traditional Email API (Transactional API)
        const result = await sendEmail(
          env.RESEND_API_KEY,
          `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
          {
            to: email.email,
            subject: email.subject,
            html,
          }
        );

        sendSuccess = result.success;

        if (result.success) {
          // Record delivery log for Email API
          try {
            await recordSequenceDeliveryLog(env, {
              sequenceId: email.sequence_id,
              sequenceStepId: email.step_id,
              subscriberId: email.subscriber_id,
              email: email.email,
              emailSubject: email.subject,
              resendId: result.id,
            });
          } catch (logError) {
            // Partial failure: email was sent but delivery tracking is broken
            // This will cause analytics gaps and potential duplicate sends on retry
            console.error('Failed to record sequence delivery log:', {
              error: logError instanceof Error ? logError.message : String(logError),
              context: {
                sequenceId: email.sequence_id,
                stepId: email.step_id,
                subscriberId: email.subscriber_id,
                email: email.email,
              },
              consequence: 'Delivery analytics will be incomplete; subscriber progress will still be updated',
            });
          }
        } else {
          // Record failed delivery log for Email API
          try {
            await recordSequenceDeliveryLog(env, {
              sequenceId: email.sequence_id,
              sequenceStepId: email.step_id,
              subscriberId: email.subscriber_id,
              email: email.email,
              emailSubject: email.subject,
              status: 'failed',
              errorMessage: result.error,
            });
          } catch (logError) {
            // Failed to record the failure - this creates a gap in delivery analytics
            // but the actual send failure is still logged below
            console.error('Failed to record sequence delivery failure log:', {
              error: logError instanceof Error ? logError.message : String(logError),
              context: {
                sequenceId: email.sequence_id,
                stepId: email.step_id,
                subscriberId: email.subscriber_id,
                email: email.email,
              },
              consequence: 'Failed delivery will not appear in analytics; send error is logged separately',
            });
          }
          console.error(`Failed to send sequence email to ${email.email}:`, result.error);
        }
      }

      // Update subscriber_sequences progress if send was successful
      if (sendSuccess) {
        // Check if this is the last step (only count enabled steps)
        const totalSteps = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM sequence_steps WHERE sequence_id = ? AND is_enabled = 1'
        ).bind(email.sequence_id).first<{ count: number }>();

        const isComplete = email.step_number >= (totalSteps?.count || 0);

        // Update progress
        await env.DB.prepare(`
          UPDATE subscriber_sequences
          SET current_step = ?,
              completed_at = ?
          WHERE id = ?
        `).bind(
          email.step_number,
          isComplete ? now : null,
          email.subscriber_sequence_id
        ).run();

        console.log(`Sequence step ${email.step_number} sent to ${email.email}${isComplete ? ' (completed)' : ''}`);
      }
    }
  } catch (error) {
    console.error('Error processing sequence emails:', error);
    throw error;
  }
}

/**
 * Enroll a subscriber in all active sequences
 * This is called when a subscriber confirms their subscription
 */
export async function enrollSubscriberInSequences(env: Env, subscriberId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  try {
    // Get all active sequences
    const sequences = await env.DB.prepare(
      'SELECT id FROM sequences WHERE is_active = 1'
    ).all<{ id: string }>();

    const activeSequences = sequences.results || [];
    console.log(`Enrolling subscriber ${subscriberId} in ${activeSequences.length} active sequence(s)`);

    for (const seq of activeSequences) {
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(`
          INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, subscriberId, seq.id, 0, now).run();

        console.log(`Enrolled subscriber ${subscriberId} in sequence ${seq.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('UNIQUE constraint failed')) {
          console.log(`Subscriber ${subscriberId} already enrolled in sequence ${seq.id}`);
        } else {
          console.error('Failed to enroll subscriber in sequence:', {
            subscriberId,
            sequenceId: seq.id,
            error: errorMessage,
          });
          // Don't throw - continue with other sequences
        }
      }
    }
  } catch (error) {
    console.error('Error enrolling subscriber in sequences:', error);
    throw error;
  }
}

/**
 * Enroll a specific subscriber in a specific sequence
 * This is used by the API endpoint
 */
export async function enrollSubscriberInSequence(
  env: Env,
  subscriberId: string,
  sequenceId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  try {
    // Check if subscriber exists and is active
    const subscriber = await env.DB.prepare(
      'SELECT id, status FROM subscribers WHERE id = ?'
    ).bind(subscriberId).first<{ id: string; status: string }>();

    if (!subscriber) {
      throw new Error('Subscriber not found');
    }

    if (subscriber.status !== 'active') {
      throw new Error('Subscriber is not active');
    }

    // Check if sequence exists and is active
    const sequence = await env.DB.prepare(
      'SELECT id, is_active FROM sequences WHERE id = ?'
    ).bind(sequenceId).first<{ id: string; is_active: number }>();

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    if (sequence.is_active !== 1) {
      throw new Error('Sequence is not active');
    }

    // Check if already enrolled
    const existing = await env.DB.prepare(
      'SELECT id FROM subscriber_sequences WHERE subscriber_id = ? AND sequence_id = ?'
    ).bind(subscriberId, sequenceId).first<{ id: string }>();

    if (existing) {
      throw new Error('Subscriber is already enrolled in this sequence');
    }

    // Enroll subscriber
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, subscriberId, sequenceId, 0, now).run();

    console.log(`Enrolled subscriber ${subscriberId} in sequence ${sequenceId}`);
  } catch (error) {
    console.error('Error enrolling subscriber in sequence:', error);
    throw error;
  }
}
