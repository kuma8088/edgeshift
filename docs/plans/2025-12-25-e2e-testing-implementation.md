# E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Playwright E2E tests for production environment (edgeshift.tech) with signup-to-sequence flow verification

**Architecture:** Playwright tests run locally, connect to production via HTTPS, access D1 via Wrangler CLI for token retrieval, trigger Cron manually for immediate sequence processing

**Tech Stack:** Playwright, TypeScript, Wrangler CLI, tsx (for helper scripts)

---

## Task 1: Playwright Setup

**Files:**
- Create: `tests/e2e/playwright.config.ts`
- Create: `package.json` (modify - add dependencies and scripts)
- Create: `.gitignore` (modify - add Playwright artifacts)

**Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test@^1.40.0
npx playwright install
```

Expected: Playwright browsers installed

**Step 2: Create Playwright config**

File: `tests/e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 本番環境なので並列実行しない
  reporter: 'html',
  use: {
    baseURL: 'https://edgeshift.tech',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60000, // シーケンス処理待ち用

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Step 3: Add test scripts to package.json**

File: `package.json` (root)

Add scripts:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:cleanup": "tsx tests/e2e/helpers/cleanup.ts"
  }
}
```

**Step 4: Update .gitignore**

File: `.gitignore`

Add:
```
# Playwright
test-results/
playwright-report/
playwright/.cache/
```

**Step 5: Verify Playwright installation**

```bash
npx playwright --version
```

Expected: Version displayed (e.g., "Version 1.40.0")

**Step 6: Commit**

```bash
git add package.json package-lock.json tests/e2e/playwright.config.ts .gitignore
git commit -m "feat: add Playwright E2E testing setup

- Install @playwright/test
- Configure for production environment testing
- Set timeout to 60s for sequence processing
- Disable parallel execution (production environment)

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: D1 Client Helper

**Files:**
- Create: `tests/e2e/helpers/d1-client.ts`
- Create: `tests/e2e/helpers/types.ts`

**Step 1: Create types file**

File: `tests/e2e/helpers/types.ts`

```typescript
export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: 'pending' | 'active' | 'unsubscribed';
  confirm_token: string | null;
  unsubscribe_token: string | null;
  signup_page_slug: string | null;
  subscribed_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
}

export interface DeliveryLog {
  id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  sequence_step_id: string | null;
  subscriber_id: string;
  email: string;
  email_subject: string | null;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  resend_id: string | null;
  sent_at: number | null;
  delivered_at: number | null;
  opened_at: number | null;
  clicked_at: number | null;
  error_message: string | null;
  created_at: number;
}
```

**Step 2: Create D1 client helper**

File: `tests/e2e/helpers/d1-client.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Subscriber, DeliveryLog } from './types';

const execAsync = promisify(exec);

const DB_NAME = 'edgeshift-newsletter';

/**
 * Execute SQL query against D1 database via Wrangler CLI
 */
export async function queryD1<T = any>(sql: string): Promise<T[]> {
  try {
    // Escape double quotes in SQL
    const escapedSql = sql.replace(/"/g, '\\"');

    const cmd = `wrangler d1 execute ${DB_NAME} --remote --command "${escapedSql}"`;
    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && !stderr.includes('Successfully')) {
      console.error('D1 query stderr:', stderr);
    }

    // Parse JSON output from Wrangler
    const output = JSON.parse(stdout);
    return output.results || [];
  } catch (error) {
    console.error('D1 query error:', error);
    throw error;
  }
}

/**
 * Get confirm_token for a subscriber by email
 */
export async function getConfirmToken(email: string): Promise<string | null> {
  const results = await queryD1<Subscriber>(
    `SELECT confirm_token FROM subscribers WHERE email = '${email}'`
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
  return queryD1<DeliveryLog>(
    `SELECT * FROM delivery_logs WHERE email = '${email}' ORDER BY created_at DESC`
  );
}

/**
 * Get subscriber by email
 */
export async function getSubscriber(email: string): Promise<Subscriber | null> {
  const results = await queryD1<Subscriber>(
    `SELECT * FROM subscribers WHERE email = '${email}'`
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
```

**Step 3: Install tsx for TypeScript execution**

```bash
npm install --save-dev tsx@^4.7.0
```

**Step 4: Test D1 client manually**

Create temporary test file: `test-d1.ts`

```typescript
import { queryD1, getSubscriber } from './tests/e2e/helpers/d1-client';

(async () => {
  // Test query
  const results = await queryD1('SELECT COUNT(*) as count FROM subscribers');
  console.log('Subscriber count:', results[0].count);
})();
```

Run:
```bash
npx tsx test-d1.ts
```

Expected: Count displayed (e.g., "Subscriber count: 5")

Delete test file after verification.

**Step 5: Commit**

```bash
git add tests/e2e/helpers/d1-client.ts tests/e2e/helpers/types.ts package.json package-lock.json
git commit -m "feat: add D1 client helper for E2E tests

- Execute SQL via Wrangler CLI
- Query subscribers and delivery logs
- Wait for status changes with timeout
- Install tsx for TypeScript script execution

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Turnstile Skip Implementation

**Files:**
- Modify: `workers/newsletter/src/routes/subscribe.ts`

**Step 1: Add test email check to subscribe handler**

File: `workers/newsletter/src/routes/subscribe.ts`

Locate the Turnstile verification block (around line 84-96):

```typescript
// Verify Turnstile token
const ip = request.headers.get('CF-Connecting-IP') || undefined;
const turnstileResult = await verifyTurnstileToken(
  turnstileToken,
  env.TURNSTILE_SECRET_KEY,
  ip
);

if (!turnstileResult.success) {
  return jsonResponse<ApiResponse>(
    { success: false, error: 'Security verification failed' },
    400
  );
}
```

Replace with:

```typescript
// テストモード: test+* メールアドレスはTurnstileスキップ
const isTestEmail = email.startsWith('test+') && email.endsWith('@edgeshift.tech');

if (!isTestEmail) {
  // Verify Turnstile token
  const ip = request.headers.get('CF-Connecting-IP') || undefined;
  const turnstileResult = await verifyTurnstileToken(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    ip
  );

  if (!turnstileResult.success) {
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Security verification failed' },
      400
    );
  }
}
```

**Step 2: Test locally with wrangler dev**

```bash
cd workers/newsletter
npm run dev
```

In another terminal, test with curl:

```bash
curl -X POST http://localhost:8787/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test+playwright@edgeshift.tech",
    "name": "Test User",
    "turnstileToken": "dummy-token"
  }'
```

Expected: Success response (Turnstile skipped for test email)

Stop dev server (Ctrl+C)

**Step 3: Deploy to production**

```bash
cd workers/newsletter
npm run deploy
```

Expected: Deployment successful

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/subscribe.ts
git commit -m "feat: skip Turnstile verification for test emails

- Allow test+*@edgeshift.tech to bypass Turnstile
- Production emails still require verification
- Enables E2E testing without manual CAPTCHA

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Cron Trigger Endpoint

**Files:**
- Modify: `workers/newsletter/src/index.ts`
- Modify: `workers/newsletter/src/scheduled.ts` (export function)

**Step 1: Export processScheduledCampaigns function**

File: `workers/newsletter/src/scheduled.ts`

Change:
```typescript
export async function processScheduledCampaigns(env: Env): Promise<{
```

To ensure it's exported (should already be exported, verify).

**Step 2: Add Cron trigger endpoint**

File: `workers/newsletter/src/index.ts`

Import processScheduledCampaigns at top:
```typescript
import { processScheduledCampaigns } from './scheduled';
```

Add new route before the `else` block (around line 216):

```typescript
} else if (path === '/api/admin/trigger-cron' && request.method === 'POST') {
  // Cron trigger endpoint for E2E testing
  if (!isAuthorized(request, env)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  try {
    const result = await processScheduledCampaigns(env);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          processed: result.processed,
          sent: result.sent,
          failed: result.failed
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Manual cron trigger error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}
```

**Step 3: Test locally**

```bash
cd workers/newsletter
npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:8787/api/admin/trigger-cron \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY"
```

Expected: JSON response with `{ success: true, data: { processed: 0, sent: 0, failed: 0 } }`

Stop dev server.

**Step 4: Deploy to production**

```bash
cd workers/newsletter
npm run deploy
```

**Step 5: Commit**

```bash
git add workers/newsletter/src/index.ts
git commit -m "feat: add manual Cron trigger endpoint for E2E tests

- POST /api/admin/trigger-cron
- Requires admin authentication
- Immediately processes scheduled campaigns/sequences
- Returns processing statistics

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Cron Trigger Helper

**Files:**
- Create: `tests/e2e/helpers/trigger-cron.ts`
- Create: `.env.local` (if not exists)

**Step 1: Create .env.local for secrets**

File: `.env.local`

```bash
ADMIN_API_KEY=your-admin-api-key-here
```

Add to .gitignore:
```bash
echo ".env.local" >> .gitignore
```

**Step 2: Create Cron trigger helper**

File: `tests/e2e/helpers/trigger-cron.ts`

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = 'https://edgeshift.tech';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY not found in .env.local');
}

/**
 * Trigger Cron job manually for immediate sequence processing
 */
export async function triggerCron(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const response = await fetch(`${BASE_URL}/api/admin/trigger-cron`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_API_KEY}`,
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
```

**Step 3: Install dotenv**

```bash
npm install --save-dev dotenv@^16.3.0
```

**Step 4: Test Cron trigger**

Create test file: `test-cron.ts`

```typescript
import { triggerCron } from './tests/e2e/helpers/trigger-cron';

(async () => {
  const result = await triggerCron();
  console.log('Cron result:', result);
})();
```

Run:
```bash
npx tsx test-cron.ts
```

Expected: `{ processed: X, sent: X, failed: X }`

Delete test file.

**Step 5: Commit**

```bash
git add tests/e2e/helpers/trigger-cron.ts .env.local.example .gitignore package.json package-lock.json
git commit -m "feat: add Cron trigger helper for E2E tests

- Manually trigger sequence processing
- Wait for sequence delivery with polling
- Load ADMIN_API_KEY from .env.local
- Install dotenv for environment variables

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

Note: Create `.env.local.example` as template:

```bash
# .env.local.example
ADMIN_API_KEY=your-admin-api-key
```

---

## Task 6: Cleanup Script

**Files:**
- Create: `tests/e2e/helpers/cleanup.ts`

**Step 1: Create cleanup script**

File: `tests/e2e/helpers/cleanup.ts`

```typescript
import { queryD1 } from './d1-client';

/**
 * Delete all test data (test+*@edgeshift.tech subscribers)
 */
export async function cleanupTestData(): Promise<{
  deletedSubscribers: number;
  deletedLogs: number;
  deletedSequences: number;
  deletedListMembers: number;
}> {
  console.log('Cleaning up test data...');

  // Delete delivery logs
  const logsResult = await queryD1(`
    DELETE FROM delivery_logs
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Delete subscriber sequences
  const sequencesResult = await queryD1(`
    DELETE FROM subscriber_sequences
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Delete contact list members
  const membersResult = await queryD1(`
    DELETE FROM contact_list_members
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Count subscribers before deletion
  const countResult = await queryD1<{ count: number }>(`
    SELECT COUNT(*) as count FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
  `);
  const subscriberCount = countResult[0]?.count || 0;

  // Delete subscribers
  await queryD1(`DELETE FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'`);

  console.log(`Deleted ${subscriberCount} test subscribers and related data`);

  return {
    deletedSubscribers: subscriberCount,
    deletedLogs: 0, // D1 doesn't return affected rows count
    deletedSequences: 0,
    deletedListMembers: 0,
  };
}

// Run cleanup if executed directly
if (require.main === module) {
  cleanupTestData()
    .then(result => {
      console.log('Cleanup complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}
```

**Step 2: Test cleanup script**

```bash
npm run test:e2e:cleanup
```

Expected: "Cleanup complete: { deletedSubscribers: X, ... }"

**Step 3: Commit**

```bash
git add tests/e2e/helpers/cleanup.ts
git commit -m "feat: add test data cleanup script

- Delete test+*@edgeshift.tech subscribers
- Remove related delivery logs, sequences, list members
- Can be run via npm run test:e2e:cleanup
- Prevents test data accumulation in production DB

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Signup-to-Sequence E2E Test

**Files:**
- Create: `tests/e2e/specs/01-signup-sequence.spec.ts`

**Step 1: Create test spec**

File: `tests/e2e/specs/01-signup-sequence.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { getConfirmToken, getDeliveryLogs, getSubscriber, waitForSubscriberStatus } from '../helpers/d1-client';
import { waitForSequenceDelivery } from '../helpers/trigger-cron';

test.describe('Signup to Sequence Email Flow', () => {
  const testEmail = `test+${Date.now()}@edgeshift.tech`;
  const testName = 'Playwright Test User';

  test('should complete full signup and receive sequence email', async ({ page }) => {
    // Step 1: Navigate to signup page
    await page.goto('/newsletter/signup/welcome');
    await expect(page).toHaveURL(/\/newsletter\/signup\/welcome/);

    // Step 2: Fill and submit signup form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="name"]', testName);

    // Note: Turnstile is skipped for test+* emails
    await page.click('button[type="submit"]');

    // Step 3: Verify success message
    await expect(page.locator('text=確認メールを送信しました')).toBeVisible({ timeout: 10000 });

    // Step 4: Wait for subscriber creation in DB
    const created = await waitForSubscriberStatus(testEmail, 'pending', 5000);
    expect(created).toBe(true);

    // Step 5: Get confirm token from D1
    const confirmToken = await getConfirmToken(testEmail);
    expect(confirmToken).toBeTruthy();

    // Step 6: Navigate to confirmation URL
    await page.goto(`/api/newsletter/confirm/${confirmToken}`);

    // Should redirect to confirmed page
    await expect(page).toHaveURL(/\/newsletter\/confirmed/);

    // Step 7: Verify subscriber is now active
    const subscriber = await getSubscriber(testEmail);
    expect(subscriber).toBeTruthy();
    expect(subscriber!.status).toBe('active');

    // Step 8: Wait for sequence email delivery (trigger cron and poll)
    const delivered = await waitForSequenceDelivery(testEmail, 30000);
    expect(delivered).toBe(true);

    // Step 9: Verify delivery logs
    const logs = await getDeliveryLogs(testEmail);
    expect(logs.length).toBeGreaterThan(0);

    const sequenceLog = logs.find(log => log.sequence_id !== null);
    expect(sequenceLog).toBeTruthy();
    expect(sequenceLog!.status).toBe('sent');
    expect(sequenceLog!.email_subject).toBeTruthy();

    console.log(`✅ Test completed: ${testEmail} received sequence email`);
  });

  test('should handle re-subscription for unsubscribed user', async ({ page }) => {
    const resubEmail = `test+resub${Date.now()}@edgeshift.tech`;

    // First subscription
    await page.goto('/newsletter/signup/welcome');
    await page.fill('input[name="email"]', resubEmail);
    await page.click('button[type="submit"]');

    const token1 = await getConfirmToken(resubEmail);
    await page.goto(`/api/newsletter/confirm/${token1}`);

    // Get unsubscribe token
    const sub1 = await getSubscriber(resubEmail);
    const unsubToken = sub1!.unsubscribe_token;

    // Unsubscribe
    await page.goto(`/api/newsletter/unsubscribe/${unsubToken}`);
    await expect(page).toHaveURL(/\/newsletter\/unsubscribed/);

    // Re-subscribe
    await page.goto('/newsletter/signup/welcome');
    await page.fill('input[name="email"]', resubEmail);
    await page.click('button[type="submit"]');

    const token2 = await getConfirmToken(resubEmail);
    expect(token2).toBeTruthy();
    expect(token2).not.toBe(token1); // New token generated

    await page.goto(`/api/newsletter/confirm/${token2}`);

    const sub2 = await getSubscriber(resubEmail);
    expect(sub2!.status).toBe('active');
    expect(sub2!.unsubscribed_at).toBeNull();
  });
});
```

**Step 2: Run the test**

```bash
npm run test:e2e
```

Expected: Both tests pass

**Step 3: View test report**

```bash
npx playwright show-report
```

**Step 4: Commit**

```bash
git add tests/e2e/specs/01-signup-sequence.spec.ts
git commit -m "feat: add signup-to-sequence E2E test

- Test full flow: signup → confirm → sequence delivery
- Verify Turnstile skip for test emails
- Test re-subscription for unsubscribed users
- Poll D1 and trigger Cron for sequence verification

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Documentation and Cleanup

**Files:**
- Create: `tests/e2e/README.md`
- Modify: `package.json` (add cleanup in test script)

**Step 1: Create E2E README**

File: `tests/e2e/README.md`

```markdown
# E2E Testing with Playwright

## Overview

End-to-end tests for the Newsletter System running against **production environment** (edgeshift.tech).

## Prerequisites

1. Install dependencies:
   ```bash
   npm install
   npx playwright install
   ```

2. Set up `.env.local`:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local and add your ADMIN_API_KEY
   ```

3. Authenticate with Wrangler (for D1 access):
   ```bash
   npx wrangler login
   ```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/specs/01-signup-sequence.spec.ts
```

## Cleanup Test Data

Test data (subscribers with `test+*@edgeshift.tech` emails) should be cleaned up periodically:

```bash
npm run test:e2e:cleanup
```

## Test Data Strategy

- **Test emails:** `test+<timestamp>@edgeshift.tech`
- **Turnstile:** Automatically skipped for test emails
- **D1 access:** Via Wrangler CLI (requires authentication)
- **Sequence testing:** Manual Cron trigger via `/api/admin/trigger-cron`

## Architecture

```
Playwright (Local)
    ↓ HTTPS
Production (edgeshift.tech)
    ↓ D1 Query (Wrangler CLI)
D1 Database
```

## Important Notes

- ⚠️ Tests run against **production environment**
- ⚠️ Real emails are sent (to test+* addresses)
- ⚠️ Test data is created in production D1 database
- ✅ Cleanup script should be run regularly
- ✅ Only one worker runs at a time (no parallel tests)

## Troubleshooting

### Wrangler authentication error

```bash
npx wrangler login
```

### Test timeouts

Increase timeout in `playwright.config.ts`:
```typescript
timeout: 120000, // 2 minutes
```

### D1 query errors

Check Wrangler version:
```bash
npx wrangler --version
```

Update if needed:
```bash
npm install --save-dev wrangler@latest
```
```

**Step 2: Update package.json to run cleanup before tests (optional)**

File: `package.json`

Modify test:e2e script:
```json
{
  "scripts": {
    "test:e2e": "npm run test:e2e:cleanup && playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:cleanup": "tsx tests/e2e/helpers/cleanup.ts"
  }
}
```

**Step 3: Commit**

```bash
git add tests/e2e/README.md package.json
git commit -m "docs: add E2E testing documentation

- Setup instructions
- Running tests guide
- Test data cleanup strategy
- Architecture diagram
- Troubleshooting tips

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 4: Final verification**

Run full test suite:
```bash
npm run test:e2e
```

Expected: All tests pass, cleanup runs before tests

---

## Implementation Checklist

### Phase 1: Core Setup ✅

- [ ] Task 1: Playwright setup
- [ ] Task 2: D1 client helper
- [ ] Task 3: Turnstile skip
- [ ] Task 4: Cron trigger endpoint
- [ ] Task 5: Cron trigger helper
- [ ] Task 6: Cleanup script
- [ ] Task 7: Signup-to-sequence test
- [ ] Task 8: Documentation

### Phase 2: Additional Tests (Future)

- [ ] Contact List E2E test
- [ ] Campaign send E2E test
- [ ] Admin CRUD E2E test

### Phase 3: CI/CD (Future)

- [ ] GitHub Actions workflow
- [ ] Manual trigger only (workflow_dispatch)
- [ ] Artifact upload on failure

---

## Validation

After implementation, verify:

1. **Playwright installed:** `npx playwright --version`
2. **D1 client works:** Query subscribers count
3. **Turnstile skipped:** Test email signup succeeds without CAPTCHA
4. **Cron trigger works:** Manual trigger returns statistics
5. **Cleanup works:** Test data is deleted
6. **E2E test passes:** Signup-to-sequence flow completes
7. **Documentation clear:** README explains setup and usage

---

## Notes

- **Production environment:** All tests run against live edgeshift.tech
- **Test data:** Use `test+*@edgeshift.tech` pattern
- **Cleanup required:** Run `npm run test:e2e:cleanup` periodically
- **Sequential execution:** Tests run one at a time (workers: 1)
- **Timeout:** 60 seconds for sequence processing

---

*Implementation plan ready for execution. Use superpowers:executing-plans or superpowers:subagent-driven-development.*
