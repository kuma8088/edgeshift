/**
 * A/B Test Sending Logic
 *
 * Handles the two-phase A/B test delivery:
 * 1. sendAbTest: Send to test groups (A and B) at scheduled_at - wait_hours
 * 2. sendAbTestWinner: Determine winner and send to remaining subscribers at scheduled_at
 */

import type { Env, Campaign, Subscriber, BrandSettings, AbVariant } from '../types';
import { getTestRatio, splitSubscribers, calculateAbScore, determineWinner } from '../utils/ab-testing';
import { renderEmail, getDefaultBrandSettings } from '../lib/templates';

export interface AbTestResult {
  groupASent: number;
  groupBSent: number;
  status: string;
}

export interface AbWinnerResult {
  winner: AbVariant;
  remainingSent: number;
}

// Email sending function type (for dependency injection in tests)
export type SendEmailFn = (
  env: Env,
  to: string,
  subject: string,
  html: string,
  fromName?: string
) => Promise<{ id: string } | null>;

/**
 * Send A/B test to subset of subscribers
 * Called at scheduled_at - wait_hours
 */
export async function sendAbTest(
  env: Env,
  campaign: Campaign,
  subscribers: Subscriber[],
  sendEmail: SendEmailFn
): Promise<AbTestResult> {
  const ratio = getTestRatio(subscribers.length);
  const { groupA, groupB, remaining } = splitSubscribers(subscribers, ratio);

  // Store remaining for later winner phase
  await storeRemainingSubscribers(env, campaign.id, remaining);

  // Get brand settings
  let brandSettings = await env.DB.prepare(
    'SELECT * FROM brand_settings WHERE id = ?'
  ).bind('default').first<BrandSettings>();

  if (!brandSettings) {
    brandSettings = getDefaultBrandSettings();
  }

  const templateId = campaign.template_id || brandSettings.default_template_id;

  // Send to group A with original subject (uses default SENDER_NAME)
  let groupASent = 0;
  for (const sub of groupA) {
    const html = renderEmail({
      templateId,
      content: campaign.content,
      subject: campaign.subject,
      brandSettings,
      subscriber: { name: sub.name, email: sub.email },
      unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
      siteUrl: env.SITE_URL,
    });

    // Variant A uses default SENDER_NAME (no fromName override)
    const result = await sendEmail(env, sub.email, campaign.subject, html);
    if (result) {
      await recordAbDeliveryLog(env, campaign.id, sub.id, sub.email, campaign.subject, result.id, 'A');
      groupASent++;
    }
  }

  // Send to group B with variant subject/from_name
  let groupBSent = 0;
  const subjectB = campaign.ab_subject_b || campaign.subject;
  const fromNameB = campaign.ab_from_name_b || undefined;
  for (const sub of groupB) {
    const html = renderEmail({
      templateId,
      content: campaign.content,
      subject: subjectB,
      brandSettings,
      subscriber: { name: sub.name, email: sub.email },
      unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
      siteUrl: env.SITE_URL,
    });

    // Variant B uses ab_from_name_b if set, otherwise default SENDER_NAME
    const result = await sendEmail(env, sub.email, subjectB, html, fromNameB);
    if (result) {
      await recordAbDeliveryLog(env, campaign.id, sub.id, sub.email, subjectB, result.id, 'B');
      groupBSent++;
    }
  }

  // Update campaign status to ab_testing
  // Note: 'ab_testing' is a custom status for A/B test phase
  // We use 'scheduled' status to indicate A/B test is in progress
  await env.DB.prepare(
    `UPDATE campaigns SET ab_test_sent_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), campaign.id).run();

  return {
    groupASent,
    groupBSent,
    status: 'ab_testing',
  };
}

/**
 * Determine winner and send to remaining subscribers
 * Called at scheduled_at
 */
export async function sendAbTestWinner(
  env: Env,
  campaign: Campaign,
  sendEmail: SendEmailFn
): Promise<AbWinnerResult> {
  // Get stats for each variant
  const stats = await getAbStatsInternal(env.DB, campaign.id);
  const winner = determineWinner(stats.variant_a, stats.variant_b);

  // Get remaining subscribers
  const remaining = await getRemainingSubscribers(env, campaign.id);

  // Get brand settings
  let brandSettings = await env.DB.prepare(
    'SELECT * FROM brand_settings WHERE id = ?'
  ).bind('default').first<BrandSettings>();

  if (!brandSettings) {
    brandSettings = getDefaultBrandSettings();
  }

  const templateId = campaign.template_id || brandSettings.default_template_id;

  // Use winner's settings
  const subject = winner === 'A' ? campaign.subject : (campaign.ab_subject_b || campaign.subject);
  // Winner's fromName: A uses default (undefined), B uses ab_from_name_b
  const fromName = winner === 'B' ? (campaign.ab_from_name_b || undefined) : undefined;

  // Send to remaining with winner's settings
  let sentCount = 0;
  for (const sub of remaining) {
    const html = renderEmail({
      templateId,
      content: campaign.content,
      subject,
      brandSettings,
      subscriber: { name: sub.name, email: sub.email },
      unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
      siteUrl: env.SITE_URL,
    });

    const result = await sendEmail(env, sub.email, subject, html, fromName);
    if (result) {
      await recordAbDeliveryLog(env, campaign.id, sub.id, sub.email, subject, result.id, winner);
      sentCount++;
    }
  }

  // Update campaign with winner and mark as sent
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE campaigns SET status = 'sent', ab_winner = ?, sent_at = ?, recipient_count = ? WHERE id = ?`
  ).bind(winner, now, sentCount + stats.variant_a.sent + stats.variant_b.sent, campaign.id).run();

  // Clean up remaining subscribers storage
  await cleanupRemainingSubscribers(env, campaign.id);

  return { winner, remainingSent: sentCount };
}

/**
 * Store remaining subscribers for later winner phase
 */
async function storeRemainingSubscribers(
  env: Env,
  campaignId: string,
  subscribers: Subscriber[]
): Promise<void> {
  const ids = subscribers.map(s => s.id).join(',');
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ab_test_remaining (campaign_id, subscriber_ids) VALUES (?, ?)`
  ).bind(campaignId, ids).run();
}

/**
 * Get remaining subscribers for winner phase
 */
async function getRemainingSubscribers(
  env: Env,
  campaignId: string
): Promise<Subscriber[]> {
  const result = await env.DB.prepare(
    `SELECT subscriber_ids FROM ab_test_remaining WHERE campaign_id = ?`
  ).bind(campaignId).first<{ subscriber_ids: string }>();

  if (!result || !result.subscriber_ids) {
    return [];
  }

  const ids = result.subscriber_ids.split(',').filter(id => id.trim());
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => '?').join(',');
  const subscribers = await env.DB.prepare(
    `SELECT * FROM subscribers WHERE id IN (${placeholders}) AND status = 'active'`
  ).bind(...ids).all<Subscriber>();

  return subscribers.results || [];
}

/**
 * Clean up remaining subscribers storage
 */
async function cleanupRemainingSubscribers(
  env: Env,
  campaignId: string
): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM ab_test_remaining WHERE campaign_id = ?`
  ).bind(campaignId).run();
}

/**
 * Record delivery log with A/B variant
 */
async function recordAbDeliveryLog(
  env: Env,
  campaignId: string,
  subscriberId: string,
  email: string,
  emailSubject: string,
  resendId: string,
  variant: AbVariant
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, email_subject, status, resend_id, ab_variant, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    campaignId,
    subscriberId,
    email,
    emailSubject,
    resendId,
    variant,
    now,
    now
  ).run();
}

/**
 * Get A/B test statistics (internal helper)
 */
async function getAbStatsInternal(db: D1Database, campaignId: string) {
  const results = await db.prepare(
    `SELECT
      ab_variant,
      COUNT(*) as sent,
      SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
    FROM delivery_logs
    WHERE campaign_id = ? AND ab_variant IS NOT NULL
    GROUP BY ab_variant`
  ).bind(campaignId).all();

  const emptyStats = { sent: 0, delivered: 0, opened: 0, clicked: 0, open_rate: 0, click_rate: 0, score: 0 };
  const statsMap: Record<string, { sent: number; delivered: number; opened: number; clicked: number; open_rate: number; click_rate: number; score: number }> = {};

  for (const row of results.results || []) {
    const variant = row.ab_variant as string;
    const sent = row.sent as number;
    const delivered = row.delivered as number;
    const opened = row.opened as number;
    const clicked = row.clicked as number;
    const open_rate = sent > 0 ? opened / sent : 0;
    const click_rate = sent > 0 ? clicked / sent : 0;
    statsMap[variant] = {
      sent,
      delivered,
      opened,
      clicked,
      open_rate,
      click_rate,
      score: calculateAbScore(open_rate, click_rate),
    };
  }

  return {
    variant_a: statsMap['A'] || emptyStats,
    variant_b: statsMap['B'] || emptyStats,
  };
}

/**
 * Get A/B test stats for a campaign (public API)
 */
export async function getAbStats(env: Env, campaignId: string) {
  return getAbStatsInternal(env.DB, campaignId);
}
