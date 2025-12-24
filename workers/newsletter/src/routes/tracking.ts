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

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
