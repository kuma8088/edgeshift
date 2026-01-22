/**
 * Resend 永続セグメント作成スクリプト
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/setup-resend-segment.ts
 *
 * Output:
 *   Segment ID を表示（wrangler secret put で設定する）
 */

const RESEND_API_BASE = 'https://api.resend.com';

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Error: RESEND_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('Creating permanent segment "newsletter-all"...');

  const response = await fetch(`${RESEND_API_BASE}/segments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'newsletter-all',
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('Failed to create segment:', result);
    process.exit(1);
  }

  console.log('\n✅ Segment created successfully!');
  console.log(`\nSegment ID: ${result.id}`);
  console.log(`\nRun the following command to set the secret:`);
  console.log(`\n  wrangler secret put RESEND_SEGMENT_ID`);
  console.log(`  (paste: ${result.id})`);
}

main().catch(console.error);
