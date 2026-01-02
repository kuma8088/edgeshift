import type { Env } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { errorResponse } from '../lib/response';

interface CampaignSummary {
  campaign_id: string;
  subject: string;
  sent_at: number;
  recipient_count: number;
  open_rate: number;
  click_rate: number;
}

interface SequenceSummary {
  sequence_id: string;
  name: string;
  enrolled: number;
  completion_rate: number;
}

interface TopSubscriber {
  subscriber_id: string;
  email: string;
  name: string | null;
  open_count: number;
  click_count: number;
}

export interface AnalyticsOverviewResponse {
  campaigns: CampaignSummary[];
  sequences: SequenceSummary[];
  top_subscribers: TopSubscriber[];
}

export async function getAnalyticsOverview(env: Env): Promise<AnalyticsOverviewResponse> {
  // Get recent 10 sent campaigns with stats
  const campaignsResult = await env.DB.prepare(`
    SELECT
      c.id as campaign_id,
      c.subject,
      c.sent_at,
      c.recipient_count,
      COUNT(CASE WHEN dl.status IN ('opened', 'clicked') THEN 1 END) as opens,
      COUNT(CASE WHEN dl.status = 'clicked' THEN 1 END) as clicks
    FROM campaigns c
    LEFT JOIN delivery_logs dl ON c.id = dl.campaign_id
    WHERE c.status = 'sent' AND c.sent_at IS NOT NULL
    GROUP BY c.id, c.subject, c.sent_at, c.recipient_count
    ORDER BY c.sent_at DESC
    LIMIT 10
  `).all<{
    campaign_id: string;
    subject: string;
    sent_at: number;
    recipient_count: number;
    opens: number;
    clicks: number;
  }>();

  const campaigns: CampaignSummary[] = (campaignsResult.results || []).map(row => {
    const openRate = row.recipient_count > 0
      ? (row.opens / row.recipient_count) * 100
      : 0;
    const clickRate = row.recipient_count > 0
      ? (row.clicks / row.recipient_count) * 100
      : 0;

    return {
      campaign_id: row.campaign_id,
      subject: row.subject,
      sent_at: row.sent_at,
      recipient_count: row.recipient_count,
      open_rate: Math.round(openRate * 10) / 10,
      click_rate: Math.round(clickRate * 10) / 10,
    };
  });

  // Get active sequences with enrollment stats
  const sequencesResult = await env.DB.prepare(`
    SELECT
      s.id as sequence_id,
      s.name,
      COUNT(ss.id) as enrolled,
      COUNT(CASE WHEN ss.completed_at IS NOT NULL THEN 1 END) as completed
    FROM sequences s
    LEFT JOIN subscriber_sequences ss ON s.id = ss.sequence_id
    WHERE s.is_active = 1
    GROUP BY s.id, s.name
    ORDER BY enrolled DESC
  `).all<{
    sequence_id: string;
    name: string;
    enrolled: number;
    completed: number;
  }>();

  const sequences: SequenceSummary[] = (sequencesResult.results || []).map(row => {
    const completionRate = row.enrolled > 0
      ? (row.completed / row.enrolled) * 100
      : 0;

    return {
      sequence_id: row.sequence_id,
      name: row.name,
      enrolled: row.enrolled,
      completion_rate: Math.round(completionRate * 10) / 10,
    };
  });

  // Get top 10 engaged subscribers by clicks and opens
  const topSubscribersResult = await env.DB.prepare(`
    SELECT
      s.id as subscriber_id,
      s.email,
      s.name,
      COUNT(DISTINCT CASE WHEN dl.status IN ('opened', 'clicked') THEN dl.id END) as open_count,
      COUNT(DISTINCT ce.id) as click_count
    FROM subscribers s
    LEFT JOIN delivery_logs dl ON s.id = dl.subscriber_id
    LEFT JOIN click_events ce ON s.id = ce.subscriber_id
    WHERE s.status = 'active'
    GROUP BY s.id, s.email, s.name
    ORDER BY click_count DESC, open_count DESC
    LIMIT 10
  `).all<{
    subscriber_id: string;
    email: string;
    name: string | null;
    open_count: number;
    click_count: number;
  }>();

  const top_subscribers: TopSubscriber[] = (topSubscribersResult.results || []).map(row => ({
    subscriber_id: row.subscriber_id,
    email: row.email,
    name: row.name,
    open_count: row.open_count,
    click_count: row.click_count,
  }));

  return {
    campaigns,
    sequences,
    top_subscribers,
  };
}

export async function handleGetAnalyticsOverview(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const overview = await getAnalyticsOverview(env);

    // Transform to match UI expectations
    const analytics = {
      campaigns: overview.campaigns.map(c => ({
        id: c.campaign_id,
        subject: c.subject,
        recipient_count: c.recipient_count,
        open_rate: c.open_rate,
        click_rate: c.click_rate,
        sent_at: c.sent_at,
      })),
      sequences: overview.sequences.map(s => ({
        id: s.sequence_id,
        name: s.name,
        enrolled: s.enrolled,
        completion_rate: s.completion_rate,
      })),
      top_subscribers: overview.top_subscribers.map(t => ({
        email: t.email,
        open_count: t.open_count,
        click_count: t.click_count,
      })),
    };

    return new Response(JSON.stringify({
      success: true,
      data: { analytics },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to get analytics overview:', error);
    return errorResponse('Internal server error', 500);
  }
}
