import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = 'https://edgeshift.tech';

function getAdminApiKey(): string {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error('ADMIN_API_KEY not found in .env.local');
  }
  return apiKey;
}

/**
 * Trigger Cron job manually for immediate sequence processing
 */
export async function triggerCron(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const adminApiKey = getAdminApiKey();

  const response = await fetch(`${BASE_URL}/api/admin/trigger-cron`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminApiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cron trigger failed: ${response.status} ${error}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(`Cron trigger error: ${result.error}`);
  }

  return result.data;
}

/**
 * Wait for sequence email to be sent (poll delivery logs)
 */
export async function waitForSequenceDelivery(
  email: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const { getDeliveryLogs } = await import('./d1-client');
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Trigger cron
    await triggerCron();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check delivery logs
    const logs = await getDeliveryLogs(email);
    const sequenceLogs = logs.filter(log => log.sequence_id !== null);

    if (sequenceLogs.length > 0) {
      return true;
    }
  }

  return false;
}
