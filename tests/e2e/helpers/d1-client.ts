import { exec } from 'child_process';
import { promisify } from 'util';
import type { Subscriber, DeliveryLog } from './types';

const execAsync = promisify(exec);

const DB_NAME = 'edgeshift-newsletter';

/**
 * Sanitize email for SQL query (escape single quotes)
 * Also validates email format
 */
function sanitizeEmail(email: string): string {
  // Validate email format
  if (!/^[a-zA-Z0-9+._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new Error(`Invalid email format: ${email}`);
  }
  // Escape single quotes for SQL
  return email.replace(/'/g, "''");
}

/**
 * Execute SQL query against D1 database via Wrangler CLI
 */
export async function queryD1<T = any>(sql: string): Promise<T[]> {
  try {
    // Escape double quotes in SQL
    const escapedSql = sql.replace(/"/g, '\\"');

    const cmd = `wrangler d1 execute ${DB_NAME} --remote --command "${escapedSql}" --json`;
    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && !stderr.includes('Successfully')) {
      console.error('D1 query stderr:', stderr);
    }

    // Parse JSON output from Wrangler (entire stdout is JSON)
    const output = JSON.parse(stdout);

    // wrangler --json returns array of result objects
    if (Array.isArray(output) && output.length > 0) {
      return output[0].results || [];
    }

    return [];
  } catch (error) {
    console.error('D1 query error:', error);
    console.error('Failed SQL:', sql);
    throw new Error(`D1 query failed: ${error instanceof Error ? error.message : String(error)}\nSQL: ${sql}`);
  }
}

/**
 * Get confirm_token for a subscriber by email
 */
export async function getConfirmToken(email: string): Promise<string | null> {
  const sanitized = sanitizeEmail(email);
  const results = await queryD1<Subscriber>(
    `SELECT confirm_token FROM subscribers WHERE email = '${sanitized}'`
  );

  if (results.length === 0) {
    return null;
  }

  return results[0].confirm_token;
}

/**
 * Get delivery logs for a subscriber by email
 */
export async function getDeliveryLogs(email: string): Promise<DeliveryLog[]> {
  const sanitized = sanitizeEmail(email);
  return queryD1<DeliveryLog>(
    `SELECT * FROM delivery_logs WHERE email = '${sanitized}' ORDER BY created_at DESC`
  );
}

/**
 * Get subscriber by email
 */
export async function getSubscriber(email: string): Promise<Subscriber | null> {
  const sanitized = sanitizeEmail(email);
  const results = await queryD1<Subscriber>(
    `SELECT * FROM subscribers WHERE email = '${sanitized}'`
  );

  return results.length > 0 ? results[0] : null;
}

/**
 * Wait for subscriber status to change (with timeout)
 */
export async function waitForSubscriberStatus(
  email: string,
  expectedStatus: 'pending' | 'active' | 'unsubscribed',
  timeoutMs: number = 10000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const subscriber = await getSubscriber(email);

    if (subscriber && subscriber.status === expectedStatus) {
      return true;
    }

    // Wait 500ms before retry
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}
