/**
 * 既存 subscriber を Resend Contact として作成し、セグメントに追加
 *
 * 使用前にD1からsubscriber情報を取得：
 *   npx wrangler d1 execute edgeshift-newsletter --remote --command="SELECT email, name FROM subscribers WHERE status = 'active'" --json > /tmp/subscribers.json
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx RESEND_SEGMENT_ID=xxx npx tsx scripts/migrate-contacts-to-segment.ts /tmp/subscribers.json
 */

import * as fs from 'fs';

const RESEND_API_BASE = 'https://api.resend.com';
const RATE_LIMIT_DELAY_MS = 550;

interface Subscriber {
  email: string;
  name: string | null;
}

interface D1ExportResult {
  success: boolean;
  results: Subscriber[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createContact(
  apiKey: string,
  email: string,
  name: string | null
): Promise<{ success: boolean; contactId?: string; existed?: boolean; error?: string }> {
  const response = await fetch(`${RESEND_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      first_name: name?.split(' ')[0] || '',
      last_name: name?.split(' ').slice(1).join(' ') || '',
      unsubscribed: false,
    }),
  });

  const result = await response.json() as { id?: string; name?: string; message?: string };

  if (response.status === 409) {
    return { success: true, existed: true };
  }

  if (!response.ok) {
    return { success: false, error: result.message || `HTTP ${response.status}` };
  }

  return { success: true, contactId: result.id };
}

async function addToSegment(
  apiKey: string,
  segmentId: string,
  contactId: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${RESEND_API_BASE}/contacts/${contactId}/segments/${segmentId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string };
    return { success: false, error: result.message || `HTTP ${response.status}` };
  }

  return { success: true };
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_SEGMENT_ID;
  const inputFile = process.argv[2];

  if (!apiKey || !segmentId) {
    console.error('Error: RESEND_API_KEY and RESEND_SEGMENT_ID environment variables are required');
    process.exit(1);
  }

  if (!inputFile) {
    console.error('Error: Input file path is required');
    console.error('Usage: RESEND_API_KEY=xxx RESEND_SEGMENT_ID=xxx npx tsx scripts/migrate-contacts-to-segment.ts /path/to/subscribers.json');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(inputFile, 'utf-8');
  const data = JSON.parse(fileContent) as D1ExportResult | Subscriber[];

  // Handle both D1 export format and simple array
  const subscribers = Array.isArray(data) ? data : data.results;

  if (!subscribers || subscribers.length === 0) {
    console.log('No subscribers to migrate');
    process.exit(0);
  }

  console.log(`Migrating ${subscribers.length} subscribers to segment ${segmentId}...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];

    if (i > 0) await sleep(RATE_LIMIT_DELAY_MS);

    // Create contact
    const contactResult = await createContact(apiKey, sub.email, sub.name);

    if (!contactResult.success) {
      console.log(`[${i+1}/${subscribers.length}] Error: ${sub.email} - ${contactResult.error}`);
      errorCount++;
      continue;
    }

    if (contactResult.existed) {
      console.log(`[${i+1}/${subscribers.length}] Skip: ${sub.email} (already exists)`);
      skipCount++;
      continue;
    }

    if (!contactResult.contactId) {
      console.log(`[${i+1}/${subscribers.length}] Error: ${sub.email} - No contact ID returned`);
      errorCount++;
      continue;
    }

    await sleep(RATE_LIMIT_DELAY_MS);

    // Add to segment
    const segmentResult = await addToSegment(apiKey, segmentId, contactResult.contactId);

    if (segmentResult.success) {
      console.log(`[${i+1}/${subscribers.length}] Migrated: ${sub.email}`);
      successCount++;
    } else {
      console.log(`[${i+1}/${subscribers.length}] Contact created but segment add failed: ${sub.email} - ${segmentResult.error}`);
      errorCount++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Migration complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Skipped: ${skipCount}`);
  console.log(`  Errors:  ${errorCount}`);
}

main().catch(console.error);
