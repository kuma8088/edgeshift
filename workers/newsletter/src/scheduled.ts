import type { Env, Campaign, Subscriber, ScheduleConfig, ScheduleType } from './types';
import { sendBatchEmails } from './lib/email';
import { recordDeliveryLogs } from './lib/delivery';
import { processSequenceEmails } from './lib/sequence-processor';

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

function calculateNextScheduledTime(
  scheduleType: ScheduleType,
  scheduleConfig: ScheduleConfig,
  now: number
): number {
  const nowDate = new Date(now * 1000);
  const { hour = 9, minute = 0, dayOfWeek, dayOfMonth } = scheduleConfig;

  switch (scheduleType) {
    case 'daily': {
      // Next day at specified time
      const next = new Date(nowDate);
      next.setDate(next.getDate() + 1);
      next.setHours(hour, minute, 0, 0);
      return Math.floor(next.getTime() / 1000);
    }

    case 'weekly': {
      // Next occurrence of specified day of week
      const next = new Date(nowDate);
      const currentDayOfWeek = next.getDay();
      const targetDayOfWeek = dayOfWeek ?? 1; // Default to Monday

      // Calculate days until next occurrence
      let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
      if (daysUntilNext <= 0) {
        daysUntilNext += 7;
      }

      next.setDate(next.getDate() + daysUntilNext);
      next.setHours(hour, minute, 0, 0);
      return Math.floor(next.getTime() / 1000);
    }

    case 'monthly': {
      // Next occurrence of specified day of month
      const next = new Date(nowDate);
      const targetDay = dayOfMonth ?? 1; // Default to 1st of month

      // Move to next month
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDay);
      next.setHours(hour, minute, 0, 0);

      // Handle case where day doesn't exist in month (e.g., 31st in February)
      if (next.getDate() !== targetDay) {
        next.setDate(0); // Go to last day of previous month
      }

      return Math.floor(next.getTime() / 1000);
    }

    default:
      return now;
  }
}

async function sendSingleCampaign(
  env: Env,
  campaign: Campaign,
  subscribers: Subscriber[]
): Promise<{ success: boolean; sent: number; error?: string }> {
  try {
    if (subscribers.length === 0) {
      return { success: false, sent: 0, error: 'No active subscribers' };
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

    // Record delivery logs
    const deliveryResults = subscribers.map((sub) => ({
      email: sub.email,
      success: sendResult.success,
      error: sendResult.error,
    }));
    await recordDeliveryLogs(env, campaign.id, subscribers, deliveryResults);

    return sendResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to send campaign ${campaign.id}:`, errorMessage);
    return { success: false, sent: 0, error: errorMessage };
  }
}

export interface ScheduledProcessResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function processScheduledCampaigns(env: Env): Promise<ScheduledProcessResult> {
  const now = Math.floor(Date.now() / 1000);
  const result: ScheduledProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
  };

  try {
    // Process sequence emails first
    console.log('Processing sequence emails...');
    await processSequenceEmails(env);

    // TODO: Phase 2 - Implement scheduled campaigns
    // For now, no campaigns are scheduled as the schema doesn't support scheduled_at
    console.log('Scheduled campaigns feature not yet implemented');
    return result;
  } catch (error) {
    console.error('Error in processScheduledCampaigns:', error);
    throw error;
  }
}
