# A/B Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add A/B testing for email campaign subject lines and sender names with automatic winner determination.

**Architecture:** Extend existing campaign system with A/B variants stored in campaigns table. Cron jobs handle test delivery (scheduled_at - wait_hours) and winner determination (scheduled_at). Admin UI gets toggle for A/B settings and results display.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Hono router, React (Astro islands), Vitest

**Worktree:** `/Users/naoya/srv/workspace/dev/edgeshift/.worktrees/feature-ab-testing`

---

## Task 1: Database Schema Changes

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Create: `workers/newsletter/migrations/007_ab_testing.sql`

**Step 1: Create migration file**

```sql
-- migrations/007_ab_testing.sql
-- A/B Testing support for campaigns

-- Add A/B test columns to campaigns
ALTER TABLE campaigns ADD COLUMN ab_test_enabled INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN ab_subject_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_from_name_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_wait_hours INTEGER DEFAULT 4;
ALTER TABLE campaigns ADD COLUMN ab_test_sent_at TEXT;
ALTER TABLE campaigns ADD COLUMN ab_winner TEXT;

-- Add variant tracking to delivery_logs
ALTER TABLE delivery_logs ADD COLUMN ab_variant TEXT;
```

**Step 2: Update schema.sql with new columns**

Add to campaigns table definition and delivery_logs table definition.

**Step 3: Apply migration to local D1**

Run: `cd workers/newsletter && npm run db:migrate`
Expected: Migration applies without errors

**Step 4: Verify schema**

Run: `cd workers/newsletter && npx wrangler d1 execute edgeshift-newsletter --local --command "PRAGMA table_info(campaigns)"`
Expected: Shows new ab_* columns

**Step 5: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/migrations/
git commit -m "feat(db): add A/B testing schema columns"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add A/B test types**

```typescript
// Add to Campaign interface
export interface Campaign {
  // ... existing fields ...
  ab_test_enabled: number; // 0 or 1
  ab_subject_b: string | null;
  ab_from_name_b: string | null;
  ab_wait_hours: number | null;
  ab_test_sent_at: string | null;
  ab_winner: 'A' | 'B' | null;
}

// Add to DeliveryLog interface
export interface DeliveryLog {
  // ... existing fields ...
  ab_variant: 'A' | 'B' | null;
}

// New types for A/B stats
export interface AbVariantStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
  score: number;
}

export interface AbTestStats {
  variant_a: AbVariantStats;
  variant_b: AbVariantStats;
  winner: 'A' | 'B' | null;
  status: 'pending' | 'testing' | 'determined';
}

// Create campaign request with A/B fields
export interface CreateCampaignRequest {
  // ... existing fields ...
  ab_test_enabled?: boolean;
  ab_subject_b?: string;
  ab_from_name_b?: string;
  ab_wait_hours?: number;
}
```

**Step 2: Run type check**

Run: `cd workers/newsletter && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add A/B testing type definitions"
```

---

## Task 3: A/B Test Utility Functions

**Files:**
- Create: `workers/newsletter/src/utils/ab-testing.ts`
- Create: `workers/newsletter/src/__tests__/ab-testing.test.ts`

**Step 1: Write failing tests**

```typescript
// src/__tests__/ab-testing.test.ts
import { describe, it, expect } from 'vitest';
import {
  getTestRatio,
  calculateAbScore,
  determineWinner,
  splitSubscribers,
} from '../utils/ab-testing';

describe('A/B Testing Utils', () => {
  describe('getTestRatio', () => {
    it('should return 0.5 for less than 100 subscribers', () => {
      expect(getTestRatio(50)).toBe(0.5);
      expect(getTestRatio(99)).toBe(0.5);
    });

    it('should return 0.2 for 100-500 subscribers', () => {
      expect(getTestRatio(100)).toBe(0.2);
      expect(getTestRatio(500)).toBe(0.2);
    });

    it('should return 0.1 for more than 500 subscribers', () => {
      expect(getTestRatio(501)).toBe(0.1);
      expect(getTestRatio(1000)).toBe(0.1);
    });
  });

  describe('calculateAbScore', () => {
    it('should calculate weighted score (70% open + 30% click)', () => {
      // 50% open rate, 20% click rate
      // Score = 0.5 * 0.7 + 0.2 * 0.3 = 0.35 + 0.06 = 0.41
      expect(calculateAbScore(0.5, 0.2)).toBeCloseTo(0.41);
    });

    it('should handle zero rates', () => {
      expect(calculateAbScore(0, 0)).toBe(0);
    });
  });

  describe('determineWinner', () => {
    it('should return A when A has higher score', () => {
      const statsA = { open_rate: 0.5, click_rate: 0.2 };
      const statsB = { open_rate: 0.4, click_rate: 0.1 };
      expect(determineWinner(statsA, statsB)).toBe('A');
    });

    it('should return B when B has higher score', () => {
      const statsA = { open_rate: 0.3, click_rate: 0.1 };
      const statsB = { open_rate: 0.5, click_rate: 0.2 };
      expect(determineWinner(statsA, statsB)).toBe('B');
    });

    it('should return A on tie (A priority)', () => {
      const statsA = { open_rate: 0.5, click_rate: 0.2 };
      const statsB = { open_rate: 0.5, click_rate: 0.2 };
      expect(determineWinner(statsA, statsB)).toBe('A');
    });
  });

  describe('splitSubscribers', () => {
    it('should split subscribers into A, B, and remaining groups', () => {
      const subscribers = Array.from({ length: 100 }, (_, i) => ({
        id: `sub-${i}`,
        email: `test${i}@example.com`,
      }));

      const { groupA, groupB, remaining } = splitSubscribers(subscribers, 0.2);

      // 20% total test = 10% each for A and B
      expect(groupA.length).toBe(10);
      expect(groupB.length).toBe(10);
      expect(remaining.length).toBe(80);

      // No duplicates
      const allIds = [...groupA, ...groupB, ...remaining].map((s) => s.id);
      expect(new Set(allIds).size).toBe(100);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/ab-testing.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

```typescript
// src/utils/ab-testing.ts

/**
 * Get test ratio based on subscriber count
 * < 100: 50% (all subscribers in test)
 * 100-500: 20%
 * > 500: 10%
 */
export function getTestRatio(subscriberCount: number): number {
  if (subscriberCount < 100) return 0.5;
  if (subscriberCount <= 500) return 0.2;
  return 0.1;
}

/**
 * Calculate A/B test score
 * Weighted: 70% open rate + 30% click rate
 */
export function calculateAbScore(openRate: number, clickRate: number): number {
  return openRate * 0.7 + clickRate * 0.3;
}

/**
 * Determine winner based on scores
 * A wins on tie
 */
export function determineWinner(
  statsA: { open_rate: number; click_rate: number },
  statsB: { open_rate: number; click_rate: number }
): 'A' | 'B' {
  const scoreA = calculateAbScore(statsA.open_rate, statsA.click_rate);
  const scoreB = calculateAbScore(statsB.open_rate, statsB.click_rate);
  return scoreA >= scoreB ? 'A' : 'B';
}

/**
 * Fisher-Yates shuffle
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Split subscribers into A, B, and remaining groups
 */
export function splitSubscribers<T>(
  subscribers: T[],
  testRatio: number
): { groupA: T[]; groupB: T[]; remaining: T[] } {
  const shuffled = shuffle(subscribers);
  const testCount = Math.floor(subscribers.length * testRatio);
  const halfTest = Math.floor(testCount / 2);

  return {
    groupA: shuffled.slice(0, halfTest),
    groupB: shuffled.slice(halfTest, halfTest * 2),
    remaining: shuffled.slice(halfTest * 2),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/ab-testing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/utils/ab-testing.ts workers/newsletter/src/__tests__/ab-testing.test.ts
git commit -m "feat(ab-test): add A/B testing utility functions"
```

---

## Task 4: A/B Test Stats Query

**Files:**
- Modify: `workers/newsletter/src/routes/campaigns.ts`
- Modify: `workers/newsletter/src/__tests__/campaigns.test.ts`

**Step 1: Write failing test**

Add to existing campaigns.test.ts:

```typescript
describe('A/B Test Stats', () => {
  it('should return ab_stats for A/B test campaign', async () => {
    // Create A/B test campaign
    const campaign = await createTestCampaign({
      ab_test_enabled: 1,
      ab_subject_b: 'Subject B',
      ab_from_name_b: 'Sender B',
      ab_wait_hours: 4,
    });

    // Create delivery logs with variants
    await createTestDeliveryLog(campaign.id, 'sub-1', 'A', { opened_at: new Date().toISOString() });
    await createTestDeliveryLog(campaign.id, 'sub-2', 'A', {});
    await createTestDeliveryLog(campaign.id, 'sub-3', 'B', {});
    await createTestDeliveryLog(campaign.id, 'sub-4', 'B', {});

    const response = await app.request(`/api/campaigns/${campaign.id}`, {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });

    const data = await response.json();
    expect(data.ab_stats).toBeDefined();
    expect(data.ab_stats.variant_a.sent).toBe(2);
    expect(data.ab_stats.variant_b.sent).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/campaigns.test.ts -- -t "ab_stats"`
Expected: FAIL

**Step 3: Implement getAbStats function**

Add to campaigns.ts:

```typescript
async function getAbStats(db: D1Database, campaignId: string): Promise<AbTestStats | null> {
  const results = await db
    .prepare(
      `SELECT
        ab_variant,
        COUNT(*) as sent,
        SUM(CASE WHEN status = 'delivered' OR status = 'opened' OR status = 'clicked' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
      FROM delivery_logs
      WHERE campaign_id = ? AND ab_variant IS NOT NULL
      GROUP BY ab_variant`
    )
    .bind(campaignId)
    .all();

  if (!results.results || results.results.length === 0) {
    return null;
  }

  const statsMap: Record<string, AbVariantStats> = {};

  for (const row of results.results) {
    const variant = row.ab_variant as string;
    const sent = row.sent as number;
    const delivered = row.delivered as number;
    const opened = row.opened as number;
    const clicked = row.clicked as number;

    const open_rate = sent > 0 ? opened / sent : 0;
    const click_rate = sent > 0 ? clicked / sent : 0;
    const score = calculateAbScore(open_rate, click_rate);

    statsMap[variant] = { sent, delivered, opened, clicked, open_rate, click_rate, score };
  }

  const variant_a = statsMap['A'] || { sent: 0, delivered: 0, opened: 0, clicked: 0, open_rate: 0, click_rate: 0, score: 0 };
  const variant_b = statsMap['B'] || { sent: 0, delivered: 0, opened: 0, clicked: 0, open_rate: 0, click_rate: 0, score: 0 };

  let winner: 'A' | 'B' | null = null;
  let status: 'pending' | 'testing' | 'determined' = 'pending';

  if (variant_a.sent > 0 && variant_b.sent > 0) {
    status = 'testing';
    winner = determineWinner(variant_a, variant_b);
  }

  return { variant_a, variant_b, winner, status };
}
```

**Step 4: Update handleGetCampaign to include ab_stats**

```typescript
// In handleGetCampaign
if (campaign.ab_test_enabled) {
  const ab_stats = await getAbStats(env.DB, id);
  return c.json({ ...campaign, ab_stats });
}
```

**Step 5: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/campaigns.test.ts -- -t "ab_stats"`
Expected: PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat(ab-test): add A/B stats query to campaign detail"
```

---

## Task 5: Campaign Creation with A/B Settings

**Files:**
- Modify: `workers/newsletter/src/routes/campaigns.ts`

**Step 1: Write failing test**

```typescript
it('should create campaign with A/B test settings', async () => {
  const response = await app.request('/api/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({
      subject: 'Subject A',
      content: 'Test content',
      scheduled_at: '2025-01-05T18:00:00Z',
      ab_test_enabled: true,
      ab_subject_b: 'Subject B',
      ab_from_name_b: 'Sender B',
      ab_wait_hours: 2,
    }),
  });

  expect(response.status).toBe(201);
  const data = await response.json();
  expect(data.ab_test_enabled).toBe(1);
  expect(data.ab_subject_b).toBe('Subject B');
  expect(data.ab_from_name_b).toBe('Sender B');
  expect(data.ab_wait_hours).toBe(2);
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/campaigns.test.ts -- -t "A/B test settings"`
Expected: FAIL

**Step 3: Update handleCreateCampaign**

```typescript
// Add to INSERT statement and bindings
const { ab_test_enabled, ab_subject_b, ab_from_name_b, ab_wait_hours } = body;

const result = await env.DB.prepare(
  `INSERT INTO campaigns (
    id, subject, content, status, scheduled_at, contact_list_id,
    template_id, slug, excerpt, from_name, reply_to, is_published,
    ab_test_enabled, ab_subject_b, ab_from_name_b, ab_wait_hours
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
  .bind(
    id, subject, content, status, scheduled_at || null, contact_list_id || null,
    template_id || null, slug, excerpt, from_name || null, reply_to || null,
    is_published ? 1 : 0,
    ab_test_enabled ? 1 : 0,
    ab_subject_b || null,
    ab_from_name_b || null,
    ab_wait_hours || 4
  )
  .run();
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/campaigns.test.ts -- -t "A/B test settings"`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat(ab-test): support A/B settings in campaign creation"
```

---

## Task 6: A/B Test Sending Logic

**Files:**
- Create: `workers/newsletter/src/routes/ab-test-send.ts`
- Create: `workers/newsletter/src/__tests__/ab-test-send.test.ts`

**Step 1: Write failing test**

```typescript
// src/__tests__/ab-test-send.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendAbTest, sendAbTestWinner } from '../routes/ab-test-send';

describe('A/B Test Sending', () => {
  describe('sendAbTest', () => {
    it('should send to A and B groups and update status to ab_testing', async () => {
      const mockEnv = createMockEnv();
      const campaign = createMockCampaign({
        ab_test_enabled: 1,
        ab_subject_b: 'Subject B',
        ab_from_name_b: 'Sender B',
        status: 'scheduled',
      });
      const subscribers = createMockSubscribers(100);

      const result = await sendAbTest(mockEnv, campaign, subscribers);

      expect(result.groupASent).toBeGreaterThan(0);
      expect(result.groupBSent).toBeGreaterThan(0);
      expect(result.status).toBe('ab_testing');
    });
  });

  describe('sendAbTestWinner', () => {
    it('should determine winner and send to remaining subscribers', async () => {
      const mockEnv = createMockEnv();
      const campaign = createMockCampaign({
        ab_test_enabled: 1,
        ab_subject_b: 'Subject B',
        status: 'ab_testing',
        ab_winner: null,
      });

      // Mock stats: A wins
      vi.spyOn(mockEnv.DB, 'prepare').mockImplementation(() => ({
        bind: () => ({
          all: () => Promise.resolve({
            results: [
              { ab_variant: 'A', sent: 10, delivered: 10, opened: 5, clicked: 2 },
              { ab_variant: 'B', sent: 10, delivered: 10, opened: 3, clicked: 1 },
            ],
          }),
        }),
      }));

      const result = await sendAbTestWinner(mockEnv, campaign);

      expect(result.winner).toBe('A');
      expect(result.remainingSent).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/ab-test-send.test.ts`
Expected: FAIL

**Step 3: Implement sendAbTest and sendAbTestWinner**

```typescript
// src/routes/ab-test-send.ts
import { Env } from '../types';
import { getTestRatio, splitSubscribers, determineWinner, calculateAbScore } from '../utils/ab-testing';
import { sendBatchEmails, recordDeliveryLogs } from './email';

export async function sendAbTest(
  env: Env,
  campaign: Campaign,
  subscribers: Subscriber[]
): Promise<{ groupASent: number; groupBSent: number; status: string }> {
  const ratio = getTestRatio(subscribers.length);
  const { groupA, groupB, remaining } = splitSubscribers(subscribers, ratio);

  // Send to group A
  const resultA = await sendBatchEmails(env, campaign, groupA, {
    subject: campaign.subject,
    from_name: campaign.from_name,
  });
  await recordDeliveryLogs(env, campaign.id, resultA, 'A');

  // Send to group B
  const resultB = await sendBatchEmails(env, campaign, groupB, {
    subject: campaign.ab_subject_b!,
    from_name: campaign.ab_from_name_b || campaign.from_name,
  });
  await recordDeliveryLogs(env, campaign.id, resultB, 'B');

  // Store remaining subscriber IDs for later
  await storeRemainingSubscribers(env, campaign.id, remaining);

  // Update campaign status
  await env.DB.prepare(
    `UPDATE campaigns SET status = 'ab_testing', ab_test_sent_at = ? WHERE id = ?`
  )
    .bind(new Date().toISOString(), campaign.id)
    .run();

  return {
    groupASent: resultA.length,
    groupBSent: resultB.length,
    status: 'ab_testing',
  };
}

export async function sendAbTestWinner(
  env: Env,
  campaign: Campaign
): Promise<{ winner: 'A' | 'B'; remainingSent: number }> {
  // Get stats and determine winner
  const stats = await getAbStats(env.DB, campaign.id);
  const winner = determineWinner(stats.variant_a, stats.variant_b);

  // Get remaining subscribers
  const remaining = await getRemainingSubscribers(env, campaign.id);

  // Send with winner's settings
  const winnerSubject = winner === 'A' ? campaign.subject : campaign.ab_subject_b!;
  const winnerFromName = winner === 'A' ? campaign.from_name : (campaign.ab_from_name_b || campaign.from_name);

  const result = await sendBatchEmails(env, campaign, remaining, {
    subject: winnerSubject,
    from_name: winnerFromName,
  });
  await recordDeliveryLogs(env, campaign.id, result, winner);

  // Update campaign
  await env.DB.prepare(
    `UPDATE campaigns SET status = 'sent', ab_winner = ?, sent_at = ?, recipient_count = ? WHERE id = ?`
  )
    .bind(winner, new Date().toISOString(), stats.variant_a.sent + stats.variant_b.sent + result.length, campaign.id)
    .run();

  return { winner, remainingSent: result.length };
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/ab-test-send.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/ab-test-send.ts workers/newsletter/src/__tests__/ab-test-send.test.ts
git commit -m "feat(ab-test): implement A/B test sending logic"
```

---

## Task 7: Cron Handler for A/B Tests

**Files:**
- Modify: `workers/newsletter/src/scheduled.ts`

**Step 1: Write failing test**

```typescript
it('should process A/B test campaigns at correct times', async () => {
  // Campaign scheduled for 18:00 with 4h wait
  // Test should run at 14:00, winner at 18:00
  const campaign = await createTestCampaign({
    ab_test_enabled: 1,
    ab_wait_hours: 4,
    scheduled_at: '2025-01-05T18:00:00Z',
    status: 'scheduled',
  });

  // Mock current time to 14:00
  vi.setSystemTime(new Date('2025-01-05T14:00:00Z'));

  await processScheduledCampaigns(mockEnv);

  const updated = await getCampaign(mockEnv.DB, campaign.id);
  expect(updated.status).toBe('ab_testing');
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/scheduled.test.ts -- -t "A/B test"`
Expected: FAIL

**Step 3: Update processScheduledCampaigns**

```typescript
// In scheduled.ts
export async function processScheduledCampaigns(env: Env): Promise<void> {
  const now = new Date();

  // Process A/B test campaigns (test phase)
  const abTestCampaigns = await env.DB.prepare(
    `SELECT * FROM campaigns
     WHERE status = 'scheduled'
     AND ab_test_enabled = 1
     AND datetime(scheduled_at, '-' || ab_wait_hours || ' hours') <= datetime(?)`
  )
    .bind(now.toISOString())
    .all<Campaign>();

  for (const campaign of abTestCampaigns.results || []) {
    const subscribers = await getActiveSubscribers(env, campaign);
    await sendAbTest(env, campaign, subscribers);
  }

  // Process A/B test winner determination
  const abTestingCampaigns = await env.DB.prepare(
    `SELECT * FROM campaigns
     WHERE status = 'ab_testing'
     AND datetime(scheduled_at) <= datetime(?)`
  )
    .bind(now.toISOString())
    .all<Campaign>();

  for (const campaign of abTestingCampaigns.results || []) {
    await sendAbTestWinner(env, campaign);
  }

  // Process regular scheduled campaigns (unchanged)
  // ...
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/scheduled.test.ts -- -t "A/B test"`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/scheduled.ts workers/newsletter/src/__tests__/scheduled.test.ts
git commit -m "feat(ab-test): add cron handler for A/B test processing"
```

---

## Task 8: Admin UI - Campaign Form A/B Settings

**Files:**
- Modify: `src/components/admin/CampaignForm.tsx`

**Step 1: Add A/B test toggle and fields**

```tsx
// Add state
const [abTestEnabled, setAbTestEnabled] = useState(false);
const [abSubjectB, setAbSubjectB] = useState('');
const [abFromNameB, setAbFromNameB] = useState('');
const [abWaitHours, setAbWaitHours] = useState<1 | 2 | 4>(4);

// Add to form JSX after scheduled_at field
{scheduledAt && (
  <div className="space-y-4 border-t pt-4">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={abTestEnabled}
        onChange={(e) => setAbTestEnabled(e.target.checked)}
        className="rounded border-gray-300"
      />
      <span className="font-medium">A/Bテストを有効にする</span>
    </label>

    {abTestEnabled && (
      <div className="ml-6 space-y-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            件名B
          </label>
          <input
            type="text"
            value={abSubjectB}
            onChange={(e) => setAbSubjectB(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            placeholder="テストする別の件名"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            送信者名B（オプション）
          </label>
          <input
            type="text"
            value={abFromNameB}
            onChange={(e) => setAbFromNameB(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            placeholder="テストする別の送信者名"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            待機時間
          </label>
          <div className="mt-2 flex gap-4">
            {[1, 2, 4].map((hours) => (
              <label key={hours} className="flex items-center">
                <input
                  type="radio"
                  name="abWaitHours"
                  value={hours}
                  checked={abWaitHours === hours}
                  onChange={() => setAbWaitHours(hours as 1 | 2 | 4)}
                  className="mr-2"
                />
                {hours}時間
              </label>
            ))}
          </div>
        </div>

        {scheduledAt && (
          <p className="text-sm text-gray-500">
            ℹ️ {formatTestTime(scheduledAt, abWaitHours)}にテスト配信 → {formatTime(scheduledAt)}に本配信
          </p>
        )}
      </div>
    )}
  </div>
)}

// Add to form submission
const payload = {
  ...basePayload,
  ab_test_enabled: abTestEnabled,
  ab_subject_b: abTestEnabled ? abSubjectB : null,
  ab_from_name_b: abTestEnabled ? abFromNameB : null,
  ab_wait_hours: abTestEnabled ? abWaitHours : null,
};
```

**Step 2: Run type check**

Run: `npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/admin/CampaignForm.tsx
git commit -m "feat(ui): add A/B test settings to campaign form"
```

---

## Task 9: Admin UI - A/B Test Results Display

**Files:**
- Modify: `src/components/admin/CampaignDetail.tsx`

**Step 1: Add A/B results component**

```tsx
// Add AbTestResults component
function AbTestResults({ stats, campaign }: { stats: AbTestStats; campaign: Campaign }) {
  const getStatusBadge = () => {
    switch (stats.status) {
      case 'pending':
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">待機中</span>;
      case 'testing':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">テスト中</span>;
      case 'determined':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded">完了</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">A/Bテスト結果</h3>
        {getStatusBadge()}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Variant A */}
        <div className={`p-4 rounded-lg ${stats.winner === 'A' ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">パターンA</span>
            {stats.winner === 'A' && <span className="text-green-600">🏆</span>}
          </div>
          <p className="text-sm text-gray-600 mb-2">件名: {campaign.subject}</p>
          <div className="space-y-1 text-sm">
            <p>送信: {stats.variant_a.sent}</p>
            <p>開封率: {(stats.variant_a.open_rate * 100).toFixed(1)}%</p>
            <p>クリック率: {(stats.variant_a.click_rate * 100).toFixed(1)}%</p>
            <p className="font-medium">スコア: {stats.variant_a.score.toFixed(2)}</p>
          </div>
        </div>

        {/* Variant B */}
        <div className={`p-4 rounded-lg ${stats.winner === 'B' ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">パターンB</span>
            {stats.winner === 'B' && <span className="text-green-600">🏆</span>}
          </div>
          <p className="text-sm text-gray-600 mb-2">件名: {campaign.ab_subject_b}</p>
          <div className="space-y-1 text-sm">
            <p>送信: {stats.variant_b.sent}</p>
            <p>開封率: {(stats.variant_b.open_rate * 100).toFixed(1)}%</p>
            <p>クリック率: {(stats.variant_b.click_rate * 100).toFixed(1)}%</p>
            <p className="font-medium">スコア: {stats.variant_b.score.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add to CampaignDetail render
{campaign.ab_test_enabled && campaign.ab_stats && (
  <AbTestResults stats={campaign.ab_stats} campaign={campaign} />
)}
```

**Step 2: Run type check and build**

Run: `npm run check && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/admin/CampaignDetail.tsx
git commit -m "feat(ui): add A/B test results display"
```

---

## Task 10: E2E Test

**Files:**
- Create: `tests/e2e/ab-testing.spec.ts`

**Step 1: Write E2E test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('A/B Testing', () => {
  test('should create campaign with A/B test settings', async ({ page }) => {
    await page.goto('/admin/campaigns/new');

    // Fill basic campaign info
    await page.fill('[name="subject"]', 'Subject A - Test');
    await page.fill('[name="content"]', 'Test content');

    // Set scheduled time
    await page.fill('[name="scheduled_at"]', '2025-01-05T18:00');

    // Enable A/B test
    await page.check('text=A/Bテストを有効にする');

    // Fill A/B settings
    await page.fill('[name="ab_subject_b"]', 'Subject B - Test');
    await page.fill('[name="ab_from_name_b"]', 'Sender B');
    await page.click('text=2時間');

    // Verify test timing info shown
    await expect(page.locator('text=テスト配信')).toBeVisible();

    // Submit
    await page.click('button:has-text("保存")');

    // Verify redirect to campaign detail
    await expect(page).toHaveURL(/\/admin\/campaigns\/[a-z0-9-]+$/);

    // Verify A/B settings saved
    await expect(page.locator('text=A/Bテスト')).toBeVisible();
  });
});
```

**Step 2: Run E2E test**

Run: `npx playwright test tests/e2e/ab-testing.spec.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/ab-testing.spec.ts
git commit -m "test(e2e): add A/B testing E2E test"
```

---

## Task 11: Deploy and Verify

**Step 1: Run all tests**

Run: `cd workers/newsletter && npm test`
Expected: All tests pass

**Step 2: Apply migration to production D1**

Run: `cd workers/newsletter && npm run db:migrate:prod`
Expected: Migration applies successfully

**Step 3: Deploy worker**

Run: `cd workers/newsletter && npm run deploy`
Expected: Deploy succeeds

**Step 4: Build and deploy frontend**

Run: `npm run build && npx wrangler pages deploy dist --project-name edgeshift`
Expected: Deploy succeeds

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(ab-test): complete A/B testing feature implementation"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Database schema changes | 10 min |
| 2 | TypeScript types | 10 min |
| 3 | A/B test utility functions | 20 min |
| 4 | A/B stats query | 15 min |
| 5 | Campaign creation with A/B | 15 min |
| 6 | A/B test sending logic | 30 min |
| 7 | Cron handler | 20 min |
| 8 | Admin UI - Form | 25 min |
| 9 | Admin UI - Results | 20 min |
| 10 | E2E test | 15 min |
| 11 | Deploy and verify | 15 min |

**Total: ~3 hours**
