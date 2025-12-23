import type { Env, DeliveryLog, DeliveryStatus } from '../types';

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

  const result = await env.DB.prepare(query).bind(...params).all();

  return (result.results as DeliveryLog[]) || [];
}
