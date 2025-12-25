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
npx playwright test tests/e2e/specs/01-signup-sequence.spec.ts --config=tests/e2e/playwright.config.ts
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

## Test Files

### Helper Modules

| File | Purpose |
|------|---------|
| `helpers/types.ts` | TypeScript type definitions for D1 entities |
| `helpers/d1-client.ts` | D1 database query interface via Wrangler CLI |
| `helpers/trigger-cron.ts` | Manual Cron trigger and sequence delivery polling |
| `helpers/cleanup.ts` | Test data cleanup script |

### Test Specs

| File | Tests |
|------|-------|
| `specs/01-signup-sequence.spec.ts` | Signup to sequence email flow, re-subscription |

## Test Flow Example

The signup-to-sequence test follows this flow:

1. Navigate to signup page (`/newsletter/signup/welcome`)
2. Fill and submit form (Turnstile is skipped for test emails)
3. Verify pending subscriber in D1
4. Get confirm token from D1
5. Navigate to confirmation URL
6. Verify subscriber is now active
7. Trigger Cron to process sequences
8. Poll delivery logs for sequence email
9. Verify delivery log entry

## Helper Functions

### D1 Client (`helpers/d1-client.ts`)

```typescript
// Execute raw SQL query
await queryD1<T>('SELECT * FROM subscribers WHERE email = "..."');

// Get subscriber by email
const subscriber = await getSubscriber(email);

// Get confirm token for verification
const token = await getConfirmToken(email);

// Get delivery logs for subscriber
const logs = await getDeliveryLogs(email);

// Wait for status change (with timeout)
await waitForSubscriberStatus(email, 'active', 10000);
```

### Cron Trigger (`helpers/trigger-cron.ts`)

```typescript
// Manually trigger Cron job
const result = await triggerCron();
// Returns: { processed: number, sent: number, failed: number }

// Wait for sequence delivery (polls Cron + D1)
const delivered = await waitForSequenceDelivery(email, 30000);
```

### Cleanup (`helpers/cleanup.ts`)

```typescript
// Delete all test data
const result = await cleanupTestData();
// Returns: { deletedSubscribers, deletedLogs, deletedSequences, deletedListMembers }
```

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

### Turnstile verification failing

Verify test email pattern:
- ✅ `test+timestamp@edgeshift.tech`
- ❌ `test@example.com` (will require Turnstile)

### Sequence email not delivered

1. Check if sequence is active in admin panel
2. Verify signup page has sequence assigned
3. Check Cron trigger response for errors
4. Review delivery logs in D1

## Environment Variables

Create `.env.local` in project root:

```bash
# Required for Cron trigger and admin operations
ADMIN_API_KEY=your-admin-api-key-here
```

## Configuration

`playwright.config.ts` settings:

- **Base URL:** `https://edgeshift.tech` (production)
- **Workers:** 1 (sequential execution)
- **Timeout:** 60 seconds (allows time for sequence processing)
- **Retries:** 0 locally, 1 in CI
- **Screenshot:** Only on failure
- **Trace:** On first retry

## Adding New Tests

1. Create new spec file in `tests/e2e/specs/`
2. Use unique test email: `test+<feature>-${Date.now()}@edgeshift.tech`
3. Import helper functions as needed
4. Run cleanup after tests (or use beforeEach/afterEach)
5. Document the test flow in this README

Example structure:

```typescript
import { test, expect } from '@playwright/test';
import { getSubscriber, getDeliveryLogs } from '../helpers/d1-client';
import { triggerCron } from '../helpers/trigger-cron';

test.describe('Feature Name', () => {
  const testEmail = `test+feature-${Date.now()}@edgeshift.tech`;

  test('should do something', async ({ page }) => {
    // Test implementation
  });
});
```

## Best Practices

1. **Unique emails:** Always use timestamp in test emails to avoid conflicts
2. **Cleanup:** Run cleanup script regularly to prevent data accumulation
3. **Wait strategies:** Use polling with timeout instead of fixed waits
4. **Error handling:** Check D1 query results before assertions
5. **Descriptive names:** Test names should clearly describe what they verify

## CI/CD Integration (Future)

Future GitHub Actions workflow:

- Trigger: Manual (workflow_dispatch) only
- Environment: Production
- Cleanup: Run before and after tests
- Artifacts: Screenshots and traces on failure
- Notifications: Failure alerts to Slack

## Support

For issues or questions:

1. Check logs in Cloudflare Workers dashboard
2. Review D1 database state via Wrangler CLI
3. Check delivery logs for email delivery status
4. Refer to worker implementation in `workers/newsletter/`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-25 | Initial E2E testing setup |
