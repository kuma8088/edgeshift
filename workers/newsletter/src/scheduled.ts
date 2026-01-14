import type { Env, Campaign, Subscriber, ScheduleConfig, ScheduleType } from './types';
import { sendBatchEmails, sendEmail } from './lib/email';
import { recordDeliveryLogs } from './lib/delivery';
import { processSequenceEmails } from './lib/sequence-processor';
import { sendAbTest, sendAbTestWinner, type SendEmailFn } from './routes/ab-test-send';
import { STYLES, COLORS, wrapInEmailLayout, applyListStyles } from './lib/templates/styles';

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Check if a URL is a YouTube URL
 */
function isYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}

/**
 * Convert YouTube URL to clickable thumbnail HTML
 * Uses maxresdefault.jpg for best quality
 * Falls back to hqdefault.jpg if maxres not available (handled by YouTube CDN)
 */
function youtubeUrlToThumbnail(url: string): string {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    console.log(`YouTube thumbnail skipped: could not extract video ID from "${url}"`);
    return url;
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return `<a href="${videoUrl}" style="${STYLES.youtubeLink}" target="_blank">
    <img src="${thumbnailUrl}" alt="YouTube video thumbnail" style="${STYLES.youtubeThumbnail}" />
  </a>`;
}

/**
 * Convert anchor tags with YouTube URLs to clickable thumbnails
 * Handles format: <a href="YOUTUBE_URL">...</a>
 */
function convertYoutubeAnchors(html: string): string {
  // Match <a> tags where href is a YouTube URL
  const anchorRegex = /<a\s+[^>]*href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^"']+)["'][^>]*>[^<]*<\/a>/gi;

  return html.replace(anchorRegex, (match, url) => {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) return match;

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return `<a href="${videoUrl}" style="${STYLES.youtubeLink}" target="_blank">
      <img src="${thumbnailUrl}" alt="YouTube video thumbnail" style="${STYLES.youtubeThumbnail}" />
    </a>`;
  });
}

/**
 * Convert YouTube URLs in text to clickable thumbnails
 * Processes standalone YouTube URLs (on their own line or surrounded by whitespace)
 */
function convertYoutubeUrls(text: string): string {
  // Match YouTube URLs that are not already inside HTML tags
  // Captures URLs on their own line or surrounded by whitespace
  const youtubeUrlRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^\s<>"。、！？]+)(?![^<]*<\/a>)/g;

  return text.replace(youtubeUrlRegex, (match) => {
    return youtubeUrlToThumbnail(match);
  });
}

/**
 * Convert plain text URLs to clickable links
 * Matches URLs starting with http:// or https://
 * Uses negative lookbehind to avoid matching URLs already inside HTML attributes
 * Note: YouTube URLs are handled separately by convertYoutubeUrls
 */
function linkifyUrls(text: string): string {
  // First, convert YouTube anchor tags to thumbnails
  let result = convertYoutubeAnchors(text);

  // Then, convert standalone YouTube URLs to thumbnails
  result = convertYoutubeUrls(result);

  // Then linkify remaining URLs (excluding YouTube URLs that weren't converted and existing links)
  // Negative lookbehind (?<!...) to skip URLs inside HTML attributes like href="..." or src="..."
  // Also skip URLs that are already inside <a> tags
  const urlRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/[^\s<>"。、！？]+)(?![^<]*<\/a>)/g;
  return result.replace(urlRegex, (match) => {
    // Skip if it's a YouTube URL (already handled) or YouTube thumbnail URL
    if (isYoutubeUrl(match) || match.includes('img.youtube.com')) {
      return match;
    }
    return `<a href="${match}" style="${STYLES.link(COLORS.accent)}">${match}</a>`;
  });
}

function buildNewsletterEmail(
  content: string,
  unsubscribeUrl: string,
  siteUrl: string
): string {
  const innerContent = `
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="${STYLES.heading(COLORS.text.primary)}">EdgeShift Newsletter</h1>
    </div>
    <div style="${STYLES.content}">
      ${applyListStyles(linkifyUrls(content))}
    </div>
    <div style="${STYLES.footerWrapper}">
      <p style="${STYLES.footer}">
        <a href="${siteUrl}" style="${STYLES.link(COLORS.accent)}">EdgeShift</a><br>
        <a href="${unsubscribeUrl}" style="${STYLES.link(COLORS.text.muted)}">配信停止はこちら</a>
      </p>
    </div>
  `;
  return wrapInEmailLayout(innerContent, COLORS.text.primary);
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

/**
 * Create a sendEmail function for A/B testing that wraps the email lib
 */
function createSendEmailFn(env: Env): SendEmailFn {
  return async (
    envParam: Env,
    to: string,
    subject: string,
    html: string,
    fromName?: string
  ): Promise<{ id: string } | null> => {
    const from = fromName
      ? `${fromName} <${envParam.SENDER_EMAIL}>`
      : `${envParam.SENDER_NAME} <${envParam.SENDER_EMAIL}>`;

    const result = await sendEmail(envParam.RESEND_API_KEY, from, {
      to,
      subject,
      html,
    });

    return result.success && result.id ? { id: result.id } : null;
  };
}

/**
 * Get active subscribers for a campaign
 * If campaign has contact_list_id, get from list
 * Otherwise get all active subscribers
 */
async function getActiveSubscribers(env: Env, campaign: Campaign): Promise<Subscriber[]> {
  if (campaign.contact_list_id) {
    const result = await env.DB.prepare(`
      SELECT s.* FROM subscribers s
      JOIN contact_list_members clm ON s.id = clm.subscriber_id
      WHERE clm.contact_list_id = ? AND s.status = 'active'
    `).bind(campaign.contact_list_id).all<Subscriber>();
    return result.results || [];
  }

  const result = await env.DB.prepare(
    "SELECT * FROM subscribers WHERE status = 'active'"
  ).all<Subscriber>();
  return result.results || [];
}

/**
 * Process A/B test campaigns that are ready for test phase
 * Test phase starts at: scheduled_at - ab_wait_hours
 */
async function processAbTestPhase(env: Env): Promise<{ processed: number; failed: number }> {
  const now = new Date().toISOString();
  let processed = 0;
  let failed = 0;

  try {
    // Find A/B test campaigns ready for test phase
    // scheduled_at - wait_hours <= now AND status = 'scheduled' AND ab_test_enabled = 1
    // AND ab_test_sent_at IS NULL (not already sent)
    // Note: scheduled_at is stored as Unix seconds (INTEGER), so use 'unixepoch' modifier
    const testPhaseCampaigns = await env.DB.prepare(`
      SELECT * FROM campaigns
      WHERE status = 'scheduled'
        AND ab_test_enabled = 1
        AND ab_test_sent_at IS NULL
        AND datetime(scheduled_at, 'unixepoch', '-' || COALESCE(ab_wait_hours, 1) || ' hours') <= datetime(?)
    `).bind(now).all<Campaign>();

    const campaigns = testPhaseCampaigns.results || [];

    if (campaigns.length === 0) {
      console.log('No A/B test campaigns ready for test phase');
      return { processed: 0, failed: 0 };
    }

    console.log(`Processing ${campaigns.length} A/B test campaign(s) for test phase`);

    const sendEmailFn = createSendEmailFn(env);

    for (const campaign of campaigns) {
      try {
        const subscribers = await getActiveSubscribers(env, campaign);

        if (subscribers.length === 0) {
          console.log(`No subscribers for A/B test campaign ${campaign.id}`);
          continue;
        }

        const result = await sendAbTest(env, campaign, subscribers, sendEmailFn);
        console.log(
          `A/B test phase for campaign ${campaign.id}: Group A sent ${result.groupASent}, Group B sent ${result.groupBSent}`
        );
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing A/B test phase for campaign ${campaign.id}:`, errorMessage);
        failed++;
      }
    }

    return { processed, failed };
  } catch (error) {
    console.error('Error in processAbTestPhase:', error);
    throw error;
  }
}

/**
 * Process A/B test campaigns that are ready for winner phase
 * Winner phase starts at: scheduled_at (original scheduled time)
 */
async function processAbTestWinnerPhase(env: Env): Promise<{ processed: number; failed: number }> {
  const now = Math.floor(Date.now() / 1000);
  let processed = 0;
  let failed = 0;

  try {
    // Find A/B test campaigns ready for winner phase
    // ab_test_sent_at IS NOT NULL (test phase completed)
    // AND scheduled_at <= now
    // AND status = 'scheduled' (not yet sent)
    const winnerPhaseCampaigns = await env.DB.prepare(`
      SELECT * FROM campaigns
      WHERE status = 'scheduled'
        AND ab_test_enabled = 1
        AND ab_test_sent_at IS NOT NULL
        AND scheduled_at <= ?
    `).bind(now).all<Campaign>();

    const campaigns = winnerPhaseCampaigns.results || [];

    if (campaigns.length === 0) {
      console.log('No A/B test campaigns ready for winner phase');
      return { processed: 0, failed: 0 };
    }

    console.log(`Processing ${campaigns.length} A/B test campaign(s) for winner phase`);

    const sendEmailFn = createSendEmailFn(env);

    for (const campaign of campaigns) {
      try {
        const result = await sendAbTestWinner(env, campaign, sendEmailFn);
        console.log(
          `A/B test winner for campaign ${campaign.id}: Winner=${result.winner}, Remaining sent=${result.remainingSent}`
        );
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing A/B test winner for campaign ${campaign.id}:`, errorMessage);

        // Mark campaign as failed
        await env.DB.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).bind(campaign.id).run();

        failed++;
      }
    }

    return { processed, failed };
  } catch (error) {
    console.error('Error in processAbTestWinnerPhase:', error);
    throw error;
  }
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

    // Process A/B test phases
    console.log('Processing A/B test campaigns...');
    const abTestPhaseResult = await processAbTestPhase(env);
    result.processed += abTestPhaseResult.processed;
    result.failed += abTestPhaseResult.failed;

    const abWinnerPhaseResult = await processAbTestWinnerPhase(env);
    result.processed += abWinnerPhaseResult.processed;
    result.sent += abWinnerPhaseResult.processed - abWinnerPhaseResult.failed;
    result.failed += abWinnerPhaseResult.failed;

    // Get non-A/B test campaigns that are scheduled for now or earlier
    const campaignsResult = await env.DB.prepare(`
      SELECT * FROM campaigns
      WHERE status = 'scheduled' AND scheduled_at <= ?
        AND (ab_test_enabled = 0 OR ab_test_enabled IS NULL)
      ORDER BY scheduled_at ASC
    `).bind(now).all<Campaign>();

    const campaigns = campaignsResult.results || [];

    if (campaigns.length === 0) {
      console.log('No campaigns to process');
      return result;
    }

    console.log(`Processing ${campaigns.length} scheduled campaign(s)`);

    // Get active subscribers once (reused for all campaigns)
    const subscribersResult = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();
    const subscribers = subscribersResult.results || [];

    // Process each campaign
    for (const campaign of campaigns) {
      result.processed++;

      try {
        // Send campaign
        const sendResult = await sendSingleCampaign(env, campaign, subscribers);

        const updateNow = Math.floor(Date.now() / 1000);

        if (sendResult.success) {
          result.sent++;

          // Update campaign based on schedule type
          if (campaign.schedule_type && campaign.schedule_type !== 'none') {
            // Recurring campaign: update last_sent_at and calculate next scheduled_at
            const config: ScheduleConfig = campaign.schedule_config
              ? JSON.parse(campaign.schedule_config)
              : {};
            const nextScheduledAt = calculateNextScheduledTime(
              campaign.schedule_type,
              config,
              updateNow
            );

            await env.DB.prepare(`
              UPDATE campaigns
              SET last_sent_at = ?, scheduled_at = ?, recipient_count = ?
              WHERE id = ?
            `).bind(updateNow, nextScheduledAt, sendResult.sent, campaign.id).run();

            console.log(
              `Recurring campaign ${campaign.id} sent. Next scheduled: ${new Date(nextScheduledAt * 1000).toISOString()}`
            );
          } else {
            // One-time campaign: mark as sent
            await env.DB.prepare(`
              UPDATE campaigns
              SET status = 'sent', sent_at = ?, recipient_count = ?
              WHERE id = ?
            `).bind(updateNow, sendResult.sent, campaign.id).run();

            console.log(`One-time campaign ${campaign.id} sent successfully`);
          }
        } else {
          result.failed++;

          // Mark campaign as failed
          await env.DB.prepare(`
            UPDATE campaigns
            SET status = 'failed'
            WHERE id = ?
          `).bind(campaign.id).run();

          console.error(`Campaign ${campaign.id} failed: ${sendResult.error}`);
        }
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing campaign ${campaign.id}:`, errorMessage);

        // Mark as failed but continue processing other campaigns
        await env.DB.prepare(`
          UPDATE campaigns
          SET status = 'failed'
          WHERE id = ?
        `).bind(campaign.id).run();
      }
    }

    console.log(
      `Processed ${result.processed} campaigns: ${result.sent} sent, ${result.failed} failed`
    );

    return result;
  } catch (error) {
    console.error('Error in processScheduledCampaigns:', error);
    throw error;
  }
}
