import type { Env, Campaign } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse } from '../lib/response';

interface TrackingStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  reached: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

interface CampaignTrackingResponse {
  campaign_id: string;
  subject: string;
  sent_at: number | null;
  stats: TrackingStats;
}

export async function getCampaignTracking(
  env: Env,
  campaignId: string
): Promise<CampaignTrackingResponse | null> {
  // Get campaign
  const campaign = await env.DB.prepare(
    'SELECT id, subject, sent_at FROM campaigns WHERE id = ?'
  ).bind(campaignId).first<Campaign>();

  if (!campaign) {
    return null;
  }

  // Get delivery stats
  const statsResult = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
    WHERE campaign_id = ?
  `).bind(campaignId).first<{
    total_sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  }>();

  const stats = statsResult || {
    total_sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0
  };

  // Calculate rates (avoid division by zero)
  const deliveryRate = stats.total_sent > 0
    ? (stats.delivered / stats.total_sent) * 100
    : 0;

  // opened/clicked/bounced count as "reached" for rate calculation
  const reached = stats.delivered + stats.opened + stats.clicked;
  const openRate = reached > 0
    ? ((stats.opened + stats.clicked) / reached) * 100
    : 0;
  const clickRate = reached > 0
    ? (stats.clicked / reached) * 100
    : 0;

  return {
    campaign_id: campaign.id,
    subject: campaign.subject,
    sent_at: campaign.sent_at || null,
    stats: {
      total_sent: stats.total_sent,
      delivered: stats.delivered,
      opened: stats.opened,
      clicked: stats.clicked,
      bounced: stats.bounced,
      failed: stats.failed,
      reached,
      delivery_rate: Math.round(deliveryRate * 10) / 10,
      open_rate: Math.round(openRate * 10) / 10,
      click_rate: Math.round(clickRate * 10) / 10,
    },
  };
}

export async function handleGetCampaignTracking(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getCampaignTracking(env, campaignId);

  if (!result) {
    return errorResponse('Campaign not found', 404);
  }

  return new Response(JSON.stringify({
    success: true,
    data: { stats: result.stats },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface ClickEvent {
  email: string;
  name: string | null;
  url: string;
  clicked_at: number;
}

interface CampaignClicksResponse {
  campaign_id: string;
  summary: {
    total_clicks: number;
    unique_clicks: number;
    top_urls: Array<{ url: string; clicks: number }>;
  };
  clicks: ClickEvent[];
}

export async function getCampaignClicks(
  env: Env,
  campaignId: string
): Promise<CampaignClicksResponse | null> {
  // Verify campaign exists
  const campaign = await env.DB.prepare(
    'SELECT id FROM campaigns WHERE id = ?'
  ).bind(campaignId).first();

  if (!campaign) {
    return null;
  }

  // Get all clicks with subscriber info
  const clicksResult = await env.DB.prepare(`
    SELECT
      s.email,
      s.name,
      ce.clicked_url as url,
      ce.clicked_at
    FROM click_events ce
    JOIN delivery_logs dl ON ce.delivery_log_id = dl.id
    JOIN subscribers s ON ce.subscriber_id = s.id
    WHERE dl.campaign_id = ?
    ORDER BY ce.clicked_at DESC
  `).bind(campaignId).all<{
    email: string;
    name: string | null;
    url: string;
    clicked_at: number;
  }>();

  const clicks = clicksResult.results || [];

  // Calculate summary
  const uniqueClickers = new Set(clicks.map(c => c.email)).size;
  const uniqueUrls = new Set(clicks.map(c => c.url)).size;

  // Calculate top URLs with click counts
  const urlCounts = new Map<string, number>();
  for (const click of clicks) {
    urlCounts.set(click.url, (urlCounts.get(click.url) || 0) + 1);
  }
  const topUrls = Array.from(urlCounts.entries())
    .map(([url, count]) => ({ url, clicks: count }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return {
    campaign_id: campaignId,
    summary: {
      total_clicks: clicks.length,
      unique_clicks: uniqueClickers,
      top_urls: topUrls,
    },
    clicks: clicks.map(c => ({
      email: c.email,
      name: c.name,
      url: c.url,
      clicked_at: c.clicked_at,
    })),
  };
}

export async function handleGetCampaignClicks(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getCampaignClicks(env, campaignId);

  if (!result) {
    return errorResponse('Campaign not found', 404);
  }

  return new Response(JSON.stringify({
    success: true,
    data: {
      clicks: result.clicks,
      summary: result.summary,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SubscriberEngagementResponse {
  subscriber: {
    id: string;
    email: string;
    name: string | null;
    status: string;
  };
  campaigns: Array<{
    id: string;
    subject: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    clicks: Array<{ url: string; clicked_at: number }>;
  }>;
  sequences: Array<{
    id: string;
    name: string;
    steps: Array<{
      step_number: number;
      subject: string;
      status: string;
      sent_at: number | null;
      opened_at: number | null;
      clicks: Array<{ url: string; clicked_at: number }>;
    }>;
  }>;
}

export async function getSubscriberEngagement(
  env: Env,
  subscriberId: string
): Promise<SubscriberEngagementResponse | null> {
  // Get subscriber
  const subscriber = await env.DB.prepare(
    'SELECT id, email, name, status FROM subscribers WHERE id = ?'
  ).bind(subscriberId).first<{
    id: string;
    email: string;
    name: string | null;
    status: string;
  }>();

  if (!subscriber) {
    return null;
  }

  // Get campaign delivery logs
  const campaignLogs = await env.DB.prepare(`
    SELECT
      dl.id as delivery_log_id,
      dl.status,
      dl.sent_at,
      dl.opened_at,
      c.id as campaign_id,
      c.subject
    FROM delivery_logs dl
    JOIN campaigns c ON dl.campaign_id = c.id
    WHERE dl.subscriber_id = ? AND dl.campaign_id IS NOT NULL
    ORDER BY dl.sent_at DESC
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    campaign_id: string;
    subject: string;
  }>();

  // Get sequence delivery logs
  const sequenceLogs = await env.DB.prepare(`
    SELECT
      dl.id as delivery_log_id,
      dl.status,
      dl.sent_at,
      dl.opened_at,
      s.id as sequence_id,
      s.name as sequence_name,
      ss.step_number,
      ss.subject
    FROM delivery_logs dl
    JOIN sequences s ON dl.sequence_id = s.id
    JOIN sequence_steps ss ON dl.sequence_step_id = ss.id
    WHERE dl.subscriber_id = ? AND dl.sequence_id IS NOT NULL
    ORDER BY s.id, ss.step_number
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    sequence_id: string;
    sequence_name: string;
    step_number: number;
    subject: string;
  }>();

  // Get all clicks for this subscriber
  const clicks = await env.DB.prepare(`
    SELECT delivery_log_id, clicked_url, clicked_at
    FROM click_events
    WHERE subscriber_id = ?
    ORDER BY clicked_at DESC
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    clicked_url: string;
    clicked_at: number;
  }>();

  const clicksByLog = new Map<string, Array<{ url: string; clicked_at: number }>>();
  for (const click of clicks.results || []) {
    if (!clicksByLog.has(click.delivery_log_id)) {
      clicksByLog.set(click.delivery_log_id, []);
    }
    clicksByLog.get(click.delivery_log_id)!.push({
      url: click.clicked_url,
      clicked_at: click.clicked_at,
    });
  }

  // Build campaigns array
  const campaigns = (campaignLogs.results || []).map(log => ({
    id: log.campaign_id,
    subject: log.subject,
    status: log.status,
    sent_at: log.sent_at,
    opened_at: log.opened_at,
    clicks: clicksByLog.get(log.delivery_log_id) || [],
  }));

  // Build sequences array (group by sequence)
  const sequenceMap = new Map<string, {
    id: string;
    name: string;
    steps: Array<{
      step_number: number;
      subject: string;
      status: string;
      sent_at: number | null;
      opened_at: number | null;
      clicks: Array<{ url: string; clicked_at: number }>;
    }>;
  }>();

  for (const log of sequenceLogs.results || []) {
    if (!sequenceMap.has(log.sequence_id)) {
      sequenceMap.set(log.sequence_id, {
        id: log.sequence_id,
        name: log.sequence_name,
        steps: [],
      });
    }
    sequenceMap.get(log.sequence_id)!.steps.push({
      step_number: log.step_number,
      subject: log.subject,
      status: log.status,
      sent_at: log.sent_at,
      opened_at: log.opened_at,
      clicks: clicksByLog.get(log.delivery_log_id) || [],
    });
  }

  return {
    subscriber: {
      id: subscriber.id,
      email: subscriber.email,
      name: subscriber.name,
      status: subscriber.status,
    },
    campaigns,
    sequences: Array.from(sequenceMap.values()),
  };
}

export async function handleGetSubscriberEngagement(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getSubscriberEngagement(env, subscriberId);

  if (!result) {
    return errorResponse('Subscriber not found', 404);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SequenceStepStats {
  step_number: number;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

interface SequenceStatsResponse {
  sequence_id: string;
  name: string;
  description: string | null;
  enrollment_stats: {
    total_enrolled: number;
    completed: number;
    in_progress: number;
  };
  steps: SequenceStepStats[];
}

export async function getSequenceStats(
  env: Env,
  sequenceId: string
): Promise<SequenceStatsResponse | null> {
  // Get sequence info
  const sequence = await env.DB.prepare(
    'SELECT id, name, description FROM sequences WHERE id = ?'
  ).bind(sequenceId).first<{
    id: string;
    name: string;
    description: string | null;
  }>();

  if (!sequence) {
    return null;
  }

  // Get enrollment stats
  const enrollmentStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_enrolled,
      COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END), 0) as in_progress
    FROM subscriber_sequences
    WHERE sequence_id = ?
  `).bind(sequenceId).first<{
    total_enrolled: number;
    completed: number;
    in_progress: number;
  }>();

  const enrollment = enrollmentStats || {
    total_enrolled: 0,
    completed: 0,
    in_progress: 0,
  };

  // Get all steps for this sequence
  const steps = await env.DB.prepare(`
    SELECT id, step_number, subject
    FROM sequence_steps
    WHERE sequence_id = ?
    ORDER BY step_number
  `).bind(sequenceId).all<{
    id: string;
    step_number: number;
    subject: string;
  }>();

  // Get stats for each step
  const stepStats: SequenceStepStats[] = [];

  for (const step of steps.results || []) {
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as sent,
        COALESCE(SUM(CASE WHEN status IN ('delivered', 'opened', 'clicked') THEN 1 ELSE 0 END), 0) as delivered,
        COALESCE(SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END), 0) as opened,
        COALESCE(SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END), 0) as clicked
      FROM delivery_logs
      WHERE sequence_id = ? AND sequence_step_id = ?
    `).bind(sequenceId, step.id).first<{
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
    }>();

    const stepData = stats || {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
    };

    // Calculate rates
    const deliveryRate = stepData.sent > 0
      ? (stepData.delivered / stepData.sent) * 100
      : 0;

    // For open/click rates, use delivered count as base
    const openRate = stepData.delivered > 0
      ? (stepData.opened / stepData.delivered) * 100
      : 0;
    const clickRate = stepData.delivered > 0
      ? (stepData.clicked / stepData.delivered) * 100
      : 0;

    stepStats.push({
      step_number: step.step_number,
      subject: step.subject,
      sent: stepData.sent,
      delivered: stepData.delivered,
      opened: stepData.opened,
      clicked: stepData.clicked,
      delivery_rate: Math.round(deliveryRate * 10) / 10,
      open_rate: Math.round(openRate * 10) / 10,
      click_rate: Math.round(clickRate * 10) / 10,
    });
  }

  return {
    sequence_id: sequence.id,
    name: sequence.name,
    description: sequence.description,
    enrollment_stats: {
      total_enrolled: enrollment.total_enrolled,
      completed: enrollment.completed,
      in_progress: enrollment.in_progress,
    },
    steps: stepStats,
  };
}

export async function handleGetSequenceStats(
  request: Request,
  env: Env,
  sequenceId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getSequenceStats(env, sequenceId);

  if (!result) {
    return errorResponse('Sequence not found', 404);
  }

  // Calculate completion rate
  const completionRate = result.enrollment_stats.total_enrolled > 0
    ? (result.enrollment_stats.completed / result.enrollment_stats.total_enrolled) * 100
    : 0;

  return new Response(JSON.stringify({
    success: true,
    data: {
      stats: {
        total_enrolled: result.enrollment_stats.total_enrolled,
        completed: result.enrollment_stats.completed,
        in_progress: result.enrollment_stats.in_progress,
        completion_rate: Math.round(completionRate * 10) / 10,
        steps: result.steps,
      },
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
