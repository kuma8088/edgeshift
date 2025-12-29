import type { Env, ReferralMilestone, Subscriber } from '../types';
import { sendEmail } from './email';

/**
 * Achievement notification result
 */
export interface NotificationResult {
  adminNotified: boolean;
  subscriberNotified: boolean;
  adminError?: string;
  subscriberError?: string;
}

/**
 * Send milestone achievement notifications
 * - Admin notification: Alert about new achievement for reward distribution
 * - Subscriber notification: Congratulatory email with badge info
 */
export async function sendMilestoneNotifications(
  env: Env,
  referrer: Subscriber,
  milestone: ReferralMilestone,
  currentReferralCount: number
): Promise<NotificationResult> {
  const result: NotificationResult = {
    adminNotified: false,
    subscriberNotified: false,
  };

  const from = `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`;

  // Send admin notification
  const adminEmail = env.ADMIN_EMAIL;
  if (adminEmail) {
    const adminResult = await sendEmail(
      env.RESEND_API_KEY,
      from,
      {
        to: adminEmail,
        subject: `[Milestone Achievement] ${referrer.email} reached ${milestone.name}`,
        html: generateAdminNotificationHtml(referrer, milestone, currentReferralCount, env.SITE_URL),
      }
    );

    if (adminResult.success) {
      result.adminNotified = true;
    } else {
      result.adminError = adminResult.error;
      console.error('Failed to send admin milestone notification:', adminResult.error);
    }
  } else {
    result.adminError = 'ADMIN_EMAIL not configured';
    console.warn('ADMIN_EMAIL not set, skipping admin notification');
  }

  // Send subscriber notification
  const subscriberResult = await sendEmail(
    env.RESEND_API_KEY,
    from,
    {
      to: referrer.email,
      subject: `Congratulations! You've earned the ${milestone.name} badge!`,
      html: generateSubscriberNotificationHtml(referrer, milestone, currentReferralCount, env.SITE_URL),
    }
  );

  if (subscriberResult.success) {
    result.subscriberNotified = true;
  } else {
    result.subscriberError = subscriberResult.error;
    console.error('Failed to send subscriber milestone notification:', subscriberResult.error);
  }

  return result;
}

/**
 * Generate HTML email for admin notification
 */
function generateAdminNotificationHtml(
  referrer: Subscriber,
  milestone: ReferralMilestone,
  currentReferralCount: number,
  siteUrl: string
): string {
  const rewardInfo = milestone.reward_type
    ? `<p><strong>Reward Type:</strong> ${milestone.reward_type}</p>
       ${milestone.reward_value ? `<p><strong>Reward Value:</strong> ${milestone.reward_value}</p>` : ''}`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Milestone Achievement Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Milestone Achievement Alert</h1>
  </div>

  <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px;">
    <p>A subscriber has achieved a new referral milestone!</p>

    <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea;">
      <h2 style="margin: 0 0 10px 0; color: #667eea;">${milestone.name}</h2>
      <p style="margin: 5px 0;"><strong>Subscriber:</strong> ${referrer.email}</p>
      <p style="margin: 5px 0;"><strong>Referral Count:</strong> ${currentReferralCount}</p>
      <p style="margin: 5px 0;"><strong>Threshold:</strong> ${milestone.threshold} referrals</p>
      ${milestone.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${milestone.description}</p>` : ''}
      ${rewardInfo}
    </div>

    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
      <h3 style="margin: 0 0 10px 0; color: #856404;">Action Required</h3>
      <p style="margin: 0;">Please process the reward distribution for this achievement.</p>
    </div>

    <p style="margin-top: 20px;">
      <a href="${siteUrl}/admin/referral" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Referral Dashboard</a>
    </p>
  </div>

  <p style="font-size: 12px; color: #6c757d; margin-top: 20px; text-align: center;">
    This is an automated notification from EdgeShift Newsletter System.
  </p>
</body>
</html>
`;
}

/**
 * Generate HTML email for subscriber notification
 */
function generateSubscriberNotificationHtml(
  referrer: Subscriber,
  milestone: ReferralMilestone,
  currentReferralCount: number,
  siteUrl: string
): string {
  const badgeEmoji = getBadgeEmoji(milestone.name);
  const rewardMessage = getRewardMessage(milestone);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Congratulations on your achievement!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 10px;">${badgeEmoji}</div>
    <h1 style="margin: 0; font-size: 28px;">Congratulations!</h1>
    <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">You've earned a new badge!</p>
  </div>

  <div style="background: #f8f9fa; padding: 25px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px;">
    <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
      <h2 style="margin: 0 0 10px 0; color: #667eea; font-size: 24px;">${milestone.name}</h2>
      ${milestone.description ? `<p style="margin: 0; color: #6c757d;">${milestone.description}</p>` : ''}
    </div>

    <p>Amazing work! You've successfully referred <strong>${currentReferralCount} people</strong> to our newsletter.</p>

    ${rewardMessage}

    <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; text-align: center;">
        <strong>Keep sharing and unlock more rewards!</strong><br>
        <span style="color: #6c757d; font-size: 14px;">Every referral brings you closer to the next milestone.</span>
      </p>
    </div>

    <p style="text-align: center;">
      <a href="${siteUrl}/newsletter/referral?code=${referrer.referral_code}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Your Referral Dashboard</a>
    </p>
  </div>

  <p style="font-size: 12px; color: #6c757d; margin-top: 20px; text-align: center;">
    Thank you for being an awesome advocate!<br>
    - The EdgeShift Team
  </p>
</body>
</html>
`;
}

/**
 * Get badge emoji based on milestone name
 */
function getBadgeEmoji(milestoneName: string): string {
  const name = milestoneName.toLowerCase();
  if (name.includes('platinum') || name.includes('diamond')) return '💎';
  if (name.includes('gold')) return '🥇';
  if (name.includes('silver')) return '🥈';
  if (name.includes('bronze')) return '🥉';
  return '🏆';
}

/**
 * Get reward message based on milestone configuration
 */
function getRewardMessage(milestone: ReferralMilestone): string {
  if (!milestone.reward_type) {
    return '';
  }

  switch (milestone.reward_type) {
    case 'badge':
      return `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
          <p style="margin: 0;"><strong>Your Reward:</strong> ${milestone.name} Badge ${milestone.reward_value ? `- ${milestone.reward_value}` : ''}</p>
        </div>
      `;
    case 'discount':
      return `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
          <p style="margin: 0;"><strong>Your Reward:</strong> ${milestone.reward_value || 'Special discount'}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #155724;">We'll send you details about how to claim your discount shortly.</p>
        </div>
      `;
    case 'content':
      return `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
          <p style="margin: 0;"><strong>Your Reward:</strong> Exclusive Content Access</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #155724;">${milestone.reward_value || 'You\'ve unlocked exclusive content!'}</p>
        </div>
      `;
    case 'custom':
      return milestone.reward_value ? `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
          <p style="margin: 0;"><strong>Your Reward:</strong> ${milestone.reward_value}</p>
        </div>
      ` : '';
    default:
      return '';
  }
}
