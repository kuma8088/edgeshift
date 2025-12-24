import type { Env } from '../types';
import { sendEmail } from './email';
import { recordSequenceDeliveryLog } from './delivery';

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
}

const JST_OFFSET_SECONDS = 9 * 60 * 60; // +9 hours in seconds

/**
 * Calculate the scheduled send time in Unix timestamp
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
    // 4. Due for next step (based on started_at + delay_days)
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
        seq.default_send_time
      FROM subscriber_sequences ss
      JOIN subscribers s ON s.id = ss.subscriber_id
      JOIN sequences seq ON seq.id = ss.sequence_id
      JOIN sequence_steps step ON step.sequence_id = ss.sequence_id
      WHERE ss.completed_at IS NULL
      AND s.status = 'active'
      AND seq.is_active = 1
      AND step.step_number = ss.current_step + 1
    `).all<PendingSequenceEmail & { delay_days: number }>();

    const pending = pendingEmails.results || [];
    console.log(`Found ${pending.length} potential sequence email(s), checking scheduled times...`);

    for (const email of pending) {
      // Calculate scheduled send time
      const sendTime = email.delay_time ?? email.default_send_time;
      const scheduledAt = calculateScheduledTime(
        email.started_at,
        email.delay_days,
        sendTime
      );

      // Skip if not yet time to send
      if (now < scheduledAt) {
        console.log(`Skipping ${email.email} step ${email.step_number}: scheduled for ${new Date(scheduledAt * 1000).toISOString()}`);
        continue;
      }

      console.log(`Sending sequence email to ${email.email}, step ${email.step_number}`);

      const result = await sendEmail(
        env.RESEND_API_KEY,
        `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        {
          to: email.email,
          subject: email.subject,
          html: buildSequenceEmail(
            email.content,
            email.name,
            `${env.SITE_URL}/api/newsletter/unsubscribe/${email.unsubscribe_token}`,
            env.SITE_URL
          ),
        }
      );

      if (result.success) {
        // Record delivery log
        try {
          await recordSequenceDeliveryLog(env, {
            sequenceId: email.sequence_id,
            sequenceStepId: email.step_id,
            subscriberId: email.subscriber_id,
            email: email.email,
            resendId: result.id,
          });
        } catch (logError) {
          console.error('Failed to record sequence delivery log:', logError);
          // Continue - email was sent successfully
        }

        // Check if this is the last step
        const totalSteps = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM sequence_steps WHERE sequence_id = ?'
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
      } else {
        // Record failed delivery log
        try {
          await recordSequenceDeliveryLog(env, {
            sequenceId: email.sequence_id,
            sequenceStepId: email.step_id,
            subscriberId: email.subscriber_id,
            email: email.email,
            status: 'failed',
            errorMessage: result.error,
          });
        } catch (logError) {
          console.error('Failed to record sequence delivery log:', logError);
        }
        console.error(`Failed to send sequence email to ${email.email}:`, result.error);
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
        // Ignore duplicate key errors (already enrolled)
        console.log(`Subscriber ${subscriberId} already enrolled in sequence ${seq.id}`);
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

/**
 * Build sequence email HTML
 * Simpler than newsletter email, focuses on personal communication
 */
function buildSequenceEmail(
  content: string,
  name: string | null,
  unsubscribeUrl: string,
  siteUrl: string
): string {
  const greeting = name ? `${name}さん、` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 16px;">
    ${greeting}
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
