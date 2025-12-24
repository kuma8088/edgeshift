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
 * Status hierarchy (higher number = more advanced state)
 * Prevents downgrade when webhooks arrive out of order
 */
const STATUS_HIERARCHY: Record<DeliveryStatus, number> = {
  'sent': 0,
  'delivered': 1,
  'opened': 2,
  'clicked': 3,
  'bounced': -1,  // Failure states are separate
  'failed': -1,
};

/**
 * Update delivery status (for webhooks: delivered, opened, clicked, bounced)
 * Prevents status downgrade when webhooks arrive out of order
 * Example: if 'clicked' arrives before 'opened', status stays 'clicked'
 */
export async function updateDeliveryStatus(
  env: Env,
  logId: string,
  status: DeliveryStatus,
  errorMessage?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Get current status to check hierarchy
  const currentLog = await env.DB.prepare(
    'SELECT status, delivered_at, opened_at, clicked_at FROM delivery_logs WHERE id = ?'
  ).bind(logId).first<{
    status: DeliveryStatus;
    delivered_at: number | null;
    opened_at: number | null;
    clicked_at: number | null;
  }>();

  if (!currentLog) {
    console.warn(`Delivery log not found: ${logId}`);
    return;
  }

  const currentLevel = STATUS_HIERARCHY[currentLog.status];
  const newLevel = STATUS_HIERARCHY[status];

  // Prevent downgrade (except for failure states)
  if (newLevel >= 0 && currentLevel >= 0 && newLevel <= currentLevel) {
    console.log(`Skipping status downgrade: ${currentLog.status} -> ${status}`);
    return;
  }

  // Determine which timestamps to set
  const updates: string[] = ['status = ?'];
  const params: (string | number | null)[] = [status];

  // For failure states, only set error_message
  if (newLevel < 0) {
    if (errorMessage) {
      updates.push('error_message = ?');
      params.push(errorMessage);
    }
  } else {
    // For success states, set timestamps hierarchically
    switch (status) {
      case 'clicked':
        // Set clicked_at, and also opened_at + delivered_at if not set
        updates.push('clicked_at = ?');
        params.push(now);
        if (!currentLog.opened_at) {
          updates.push('opened_at = ?');
          params.push(now);
        }
        if (!currentLog.delivered_at) {
          updates.push('delivered_at = ?');
          params.push(now);
        }
        break;

      case 'opened':
        // Set opened_at, and also delivered_at if not set
        updates.push('opened_at = ?');
        params.push(now);
        if (!currentLog.delivered_at) {
          updates.push('delivered_at = ?');
          params.push(now);
        }
        break;

      case 'delivered':
        updates.push('delivered_at = ?');
        params.push(now);
        break;
    }

    if (errorMessage) {
      updates.push('error_message = ?');
      params.push(errorMessage);
    }
  }

  params.push(logId);

  await env.DB.prepare(`
    UPDATE delivery_logs
    SET ${updates.join(', ')}
    WHERE id = ?
  `).bind(...params).run();
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
 * Record a click event (with duplicate prevention)
 * Skips if same delivery_log_id + clicked_url was recorded within 60 seconds
 */
export async function recordClickEvent(
  env: Env,
  params: RecordClickEventParams
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const dedupeWindow = 60; // seconds

  // Check for recent duplicate
  const existing = await env.DB.prepare(`
    SELECT id FROM click_events
    WHERE delivery_log_id = ? AND clicked_url = ? AND clicked_at > ?
    LIMIT 1
  `).bind(
    params.deliveryLogId,
    params.clickedUrl,
    now - dedupeWindow
  ).first();

  if (existing) {
    console.log(`Skipping duplicate click event for ${params.deliveryLogId}: ${params.clickedUrl}`);
    return;
  }

  const id = crypto.randomUUID();

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

export interface RecordSequenceDeliveryLogParams {
  sequenceId: string;
  sequenceStepId: string;
  subscriberId: string;
  email: string;
  emailSubject: string;  // Preserved for historical reference
  resendId?: string;
  status?: DeliveryStatus;
  errorMessage?: string;
}

/**
 * Record a sequence delivery log entry
 * Stores email_subject at send time so history is preserved even if step is edited/deleted
 */
export async function recordSequenceDeliveryLog(
  env: Env,
  params: RecordSequenceDeliveryLogParams
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const status = params.status || 'sent';

  await env.DB.prepare(`
    INSERT INTO delivery_logs (
      id, campaign_id, sequence_id, sequence_step_id, subscriber_id, email, email_subject, status, resend_id, sent_at, error_message
    )
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.sequenceId,
    params.sequenceStepId,
    params.subscriberId,
    params.email,
    params.emailSubject,
    status,
    params.resendId || null,
    status === 'sent' || status === 'delivered' ? now : null,
    params.errorMessage || null
  ).run();
}
