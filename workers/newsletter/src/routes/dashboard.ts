import type { Env } from '../types';
import { isAuthorizedAsync } from '../lib/auth';

interface DashboardStats {
  subscribers: {
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
  };
  campaigns: {
    total: number;
    draft: number;
    scheduled: number;
    sent: number;
  };
  delivery: {
    total: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    openRate: number;
    clickRate: number;
  };
  sequences: {
    total: number;
    active: number;
    totalEnrolled: number;
    completed: number;
  };
}

export async function getDashboardStats(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get subscriber stats
  const subscriberStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribed
    FROM subscribers
  `).first<{
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
  }>();

  // Get campaign stats
  const campaignStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent
    FROM campaigns
  `).first<{
    total: number;
    draft: number;
    scheduled: number;
    sent: number;
  }>();

  // Get delivery stats
  // Use timestamp fields for opened/clicked to count cumulative events
  // (status transitions: sent → delivered → opened → clicked, so status alone misses intermediate states)
  const deliveryStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
  `).first<{
    total: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  }>();

  // Get sequence stats
  const sequenceStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
    FROM sequences
  `).first<{
    total: number;
    active: number;
  }>();

  // Get sequence enrollment stats
  const enrollmentStats = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as totalEnrolled,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed
    FROM subscriber_sequences
  `).first<{
    totalEnrolled: number;
    completed: number;
  }>();

  // Calculate rates
  // Timestamp-based counts are already cumulative:
  // - delivered_at IS NOT NULL = all delivered (includes opened and clicked)
  // - opened_at IS NOT NULL = all opened (includes clicked)
  // - clicked_at IS NOT NULL = all clicked
  const delivered = deliveryStats?.delivered ?? 0;
  const opened = deliveryStats?.opened ?? 0;
  const clicked = deliveryStats?.clicked ?? 0;

  const openRate = delivered > 0 ? Math.round((opened / delivered) * 100 * 10) / 10 : 0;
  const clickRate = opened > 0 ? Math.round((clicked / opened) * 100 * 10) / 10 : 0;

  const stats: DashboardStats = {
    subscribers: {
      total: subscriberStats?.total ?? 0,
      active: subscriberStats?.active ?? 0,
      pending: subscriberStats?.pending ?? 0,
      unsubscribed: subscriberStats?.unsubscribed ?? 0,
    },
    campaigns: {
      total: campaignStats?.total ?? 0,
      draft: campaignStats?.draft ?? 0,
      scheduled: campaignStats?.scheduled ?? 0,
      sent: campaignStats?.sent ?? 0,
    },
    delivery: {
      total: deliveryStats?.total ?? 0,
      delivered: deliveryStats?.delivered ?? 0,
      opened: deliveryStats?.opened ?? 0,
      clicked: deliveryStats?.clicked ?? 0,
      bounced: deliveryStats?.bounced ?? 0,
      failed: deliveryStats?.failed ?? 0,
      openRate,
      clickRate,
    },
    sequences: {
      total: sequenceStats?.total ?? 0,
      active: sequenceStats?.active ?? 0,
      totalEnrolled: enrollmentStats?.totalEnrolled ?? 0,
      completed: enrollmentStats?.completed ?? 0,
    },
  };

  return new Response(JSON.stringify({ success: true, data: stats }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
