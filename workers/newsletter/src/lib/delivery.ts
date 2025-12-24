import type { Env, DeliveryLog, DeliveryStatus, ClickEvent } from '../types';

export interface RecordDeliveryLogParams {
  campaignId: string;
  subscriberId: string;
  email: string;
  status: DeliveryStatus;
  resendId?: string;
  errorMessage?: string;
}

/**
 * Record a delivery log entry
 */
export async function recordDeliveryLog(
  env: Env,
  params: RecordDeliveryLogParams
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(`
    INSERT INTO delivery_logs (
      id, campaign_id, subscriber_id, email, status, resend_id, sent_at, error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.campaignId,
    params.subscriberId,
    params.email,
    params.status,
    params.resendId || null,
    params.status === 'sent' || params.status === 'delivered' ? now : null,
    params.errorMessage || null
  ).run();
}

/**
 * Update delivery status (for webhooks: delivered, opened, clicked, bounced)
 */
export async function updateDeliveryStatus(
  env: Env,
  logId: string,
  status: DeliveryStatus,
  errorMessage?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Determine which timestamp field to update based on status
  let timestampField: string | null = null;
  switch (status) {
    case 'delivered':
      timestampField = 'delivered_at';
      break;
    case 'opened':
      timestampField = 'opened_at';
      break;
    case 'clicked':
      timestampField = 'clicked_at';
      break;
  }

  if (timestampField) {
    await env.DB.prepare(`
      UPDATE delivery_logs
      SET status = ?, ${timestampField} = ?, error_message = ?
      WHERE id = ?
    `).bind(status, now, errorMessage || null, logId).run();
  } else {
    // For statuses without timestamp (bounced, failed)
    await env.DB.prepare(`
      UPDATE delivery_logs
      SET status = ?, error_message = ?
      WHERE id = ?
    `).bind(status, errorMessage || null, logId).run();
  }
}

/**
 * Get delivery logs for a campaign, optionally filtered by status
 */
export async function getDeliveryLogs(
  env: Env,
  campaignId: string,
  status?: DeliveryStatus
): Promise<DeliveryLog[]> {
  let query = `
    SELECT *
    FROM delivery_logs
    WHERE campaign_id = ?
  `;
  const params: string[] = [campaignId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all<DeliveryLog>();

  return result.results || [];
}

/**
 * Record delivery logs for a batch of subscribers
 */
export async function recordDeliveryLogs(
  env: Env,
  campaignId: string,
  subscribers: Array<{ id: string; email: string }>,
  results: Array<{ email: string; success: boolean; resendId?: string; error?: string }>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const resultMap = new Map(results.map(r => [r.email, r]));

  for (const subscriber of subscribers) {
    const result = resultMap.get(subscriber.email);
    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id, sent_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      campaignId,
      subscriber.id,
      subscriber.email,
      result?.success ? 'sent' : 'failed',
      result?.resendId || null,
      result?.success ? now : null,
      result?.error || null
    ).run();
  }
}

/**
 * Get delivery statistics for a campaign
 */
export async function getDeliveryStats(
  env: Env,
  campaignId: string
): Promise<{
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}> {
  const result = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
    WHERE campaign_id = ?
  `).bind(campaignId).first<{
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  }>();

  return {
    total: result?.total ?? 0,
    sent: result?.sent ?? 0,
    delivered: result?.delivered ?? 0,
    opened: result?.opened ?? 0,
    clicked: result?.clicked ?? 0,
    bounced: result?.bounced ?? 0,
    failed: result?.failed ?? 0,
  };
}

/**
 * Find a delivery log by Resend email ID
 */
export async function findDeliveryLogByResendId(
  env: Env,
  resendId: string
): Promise<DeliveryLog | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM delivery_logs WHERE resend_id = ?'
  ).bind(resendId).first<DeliveryLog>();

  return result || null;
}

export interface RecordClickEventParams {
  deliveryLogId: string;
  subscriberId: string;
  clickedUrl: string;
}

/**
 * Record a click event
 */
export async function recordClickEvent(
  env: Env,
  params: RecordClickEventParams
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(`
    INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    params.deliveryLogId,
    params.subscriberId,
    params.clickedUrl,
    now
  ).run();
}

/**
 * Get click events for a delivery log
 */
export async function getClickEvents(
  env: Env,
  deliveryLogId: string
): Promise<ClickEvent[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM click_events
    WHERE delivery_log_id = ?
    ORDER BY clicked_at ASC
  `).bind(deliveryLogId).all<ClickEvent>();

  return result.results || [];
}
