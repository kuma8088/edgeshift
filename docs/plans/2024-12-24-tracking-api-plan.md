# Tracking API (Batch 3C) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** キャンペーン・購読者のトラッキングデータを取得する3つのAPIエンドポイントを実装する

**Architecture:** 新規ルートファイル `routes/tracking.ts` を作成し、`delivery_logs` と `click_events` テーブルからデータを集計してJSON APIとして提供。既存の認証ミドルウェアパターンを踏襲。

**Tech Stack:** Cloudflare Workers, D1, TypeScript, Vitest

---

## Task 1: getCampaignTracking 実装（TDD）

**Files:**
- Create: `workers/newsletter/src/routes/tracking.ts`
- Create: `workers/newsletter/src/__tests__/tracking.test.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: テストファイル作成**

```typescript
// workers/newsletter/src/__tests__/tracking.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('tracking API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('getCampaignTracking', () => {
    it('should return tracking stats for a campaign', async () => {
      const env = getTestEnv();

      // Setup: Create campaign
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status, sent_at)
        VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent', 1703404800)
      `).run();

      // Setup: Create delivery logs with various statuses
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at)
        VALUES
          ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'delivered', 1703404800),
          ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'opened', 1703404800),
          ('dl-3', 'camp-1', 'sub-3', 'user3@example.com', 'clicked', 1703404800),
          ('dl-4', 'camp-1', 'sub-4', 'user4@example.com', 'bounced', 1703404800)
      `).run();

      // Import and call the function
      const { getCampaignTracking } = await import('../routes/tracking');
      const result = await getCampaignTracking(env, 'camp-1');

      expect(result).toEqual({
        campaign_id: 'camp-1',
        subject: 'Test Campaign',
        sent_at: 1703404800,
        stats: {
          total_sent: 4,
          delivered: 1,
          opened: 1,
          clicked: 1,
          bounced: 1,
          failed: 0,
          delivery_rate: 25.0,
          open_rate: 50.0,
          click_rate: 50.0,
        },
      });
    });

    it('should return null for non-existent campaign', async () => {
      const env = getTestEnv();
      const { getCampaignTracking } = await import('../routes/tracking');
      const result = await getCampaignTracking(env, 'non-existent');
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: FAIL - module not found

**Step 3: 実装**

```typescript
// workers/newsletter/src/routes/tracking.ts
import type { Env, Campaign, DeliveryLog } from '../types';
import { verifyApiKey } from './campaigns';

interface TrackingStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

interface CampaignTrackingResponse {
  campaign_id: string;
  subject: string;
  sent_at: number | null;
  stats: TrackingStats;
}

export async function getCampaignTracking(
  env: Env,
  campaignId: string
): Promise<CampaignTrackingResponse | null> {
  // Get campaign
  const campaign = await env.DB.prepare(
    'SELECT id, subject, sent_at FROM campaigns WHERE id = ?'
  ).bind(campaignId).first<Campaign>();

  if (!campaign) {
    return null;
  }

  // Get delivery stats
  const statsResult = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
    WHERE campaign_id = ?
  `).bind(campaignId).first<{
    total_sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  }>();

  const stats = statsResult || {
    total_sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0
  };

  // Calculate rates (avoid division by zero)
  const deliveryRate = stats.total_sent > 0
    ? (stats.delivered / stats.total_sent) * 100
    : 0;

  // opened/clicked/bounced count as "reached" for rate calculation
  const reached = stats.delivered + stats.opened + stats.clicked;
  const openRate = reached > 0
    ? ((stats.opened + stats.clicked) / reached) * 100
    : 0;
  const clickRate = reached > 0
    ? (stats.clicked / reached) * 100
    : 0;

  return {
    campaign_id: campaign.id,
    subject: campaign.subject,
    sent_at: campaign.sent_at || null,
    stats: {
      total_sent: stats.total_sent,
      delivered: stats.delivered,
      opened: stats.opened,
      clicked: stats.clicked,
      bounced: stats.bounced,
      failed: stats.failed,
      delivery_rate: Math.round(deliveryRate * 10) / 10,
      open_rate: Math.round(openRate * 10) / 10,
      click_rate: Math.round(clickRate * 10) / 10,
    },
  };
}

export async function handleGetCampaignTracking(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!verifyApiKey(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getCampaignTracking(env, campaignId);

  if (!result) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
git add workers/newsletter/src/routes/tracking.ts workers/newsletter/src/__tests__/tracking.test.ts
git commit -m "feat(tracking): add getCampaignTracking function with tests"
```

---

## Task 2: getCampaignClicks 実装（TDD）

**Files:**
- Modify: `workers/newsletter/src/routes/tracking.ts`
- Modify: `workers/newsletter/src/__tests__/tracking.test.ts`

**Step 1: テスト追加**

```typescript
// Add to tracking.test.ts
describe('getCampaignClicks', () => {
  it('should return all clicks for a campaign', async () => {
    const env = getTestEnv();

    // Setup: Create campaign and subscribers
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent')
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status)
      VALUES
        ('sub-1', 'user1@example.com', 'User 1', 'active'),
        ('sub-2', 'user2@example.com', 'User 2', 'active')
    `).run();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status)
      VALUES
        ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'clicked'),
        ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'clicked')
    `).run();

    await env.DB.prepare(`
      INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
      VALUES
        ('ce-1', 'dl-1', 'sub-1', 'https://example.com/article1', 1703404800),
        ('ce-2', 'dl-1', 'sub-1', 'https://example.com/article1', 1703408400),
        ('ce-3', 'dl-2', 'sub-2', 'https://example.com/article2', 1703410000)
    `).run();

    const { getCampaignClicks } = await import('../routes/tracking');
    const result = await getCampaignClicks(env, 'camp-1');

    expect(result).not.toBeNull();
    expect(result!.campaign_id).toBe('camp-1');
    expect(result!.summary.total_clicks).toBe(3);
    expect(result!.summary.unique_clickers).toBe(2);
    expect(result!.summary.unique_urls).toBe(2);
    expect(result!.clicks).toHaveLength(3);
    expect(result!.clicks[0]).toMatchObject({
      email: 'user1@example.com',
      name: 'User 1',
      url: 'https://example.com/article1',
    });
  });

  it('should return empty clicks for campaign with no clicks', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Campaign', '<p>Content</p>', 'sent')
    `).run();

    const { getCampaignClicks } = await import('../routes/tracking');
    const result = await getCampaignClicks(env, 'camp-1');

    expect(result).not.toBeNull();
    expect(result!.summary.total_clicks).toBe(0);
    expect(result!.clicks).toHaveLength(0);
  });
});
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: FAIL - getCampaignClicks not defined

**Step 3: 実装追加**

```typescript
// Add to tracking.ts
interface ClickEvent {
  email: string;
  name: string | null;
  url: string;
  clicked_at: number;
}

interface CampaignClicksResponse {
  campaign_id: string;
  summary: {
    total_clicks: number;
    unique_clickers: number;
    unique_urls: number;
  };
  clicks: ClickEvent[];
}

export async function getCampaignClicks(
  env: Env,
  campaignId: string
): Promise<CampaignClicksResponse | null> {
  // Verify campaign exists
  const campaign = await env.DB.prepare(
    'SELECT id FROM campaigns WHERE id = ?'
  ).bind(campaignId).first();

  if (!campaign) {
    return null;
  }

  // Get all clicks with subscriber info
  const clicksResult = await env.DB.prepare(`
    SELECT
      s.email,
      s.name,
      ce.clicked_url as url,
      ce.clicked_at
    FROM click_events ce
    JOIN delivery_logs dl ON ce.delivery_log_id = dl.id
    JOIN subscribers s ON ce.subscriber_id = s.id
    WHERE dl.campaign_id = ?
    ORDER BY ce.clicked_at DESC
  `).bind(campaignId).all<{
    email: string;
    name: string | null;
    url: string;
    clicked_at: number;
  }>();

  const clicks = clicksResult.results || [];

  // Calculate summary
  const uniqueClickers = new Set(clicks.map(c => c.email)).size;
  const uniqueUrls = new Set(clicks.map(c => c.url)).size;

  return {
    campaign_id: campaignId,
    summary: {
      total_clicks: clicks.length,
      unique_clickers: uniqueClickers,
      unique_urls: uniqueUrls,
    },
    clicks: clicks.map(c => ({
      email: c.email,
      name: c.name,
      url: c.url,
      clicked_at: c.clicked_at,
    })),
  };
}

export async function handleGetCampaignClicks(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!verifyApiKey(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getCampaignClicks(env, campaignId);

  if (!result) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
git add workers/newsletter/src/routes/tracking.ts workers/newsletter/src/__tests__/tracking.test.ts
git commit -m "feat(tracking): add getCampaignClicks function with tests"
```

---

## Task 3: getSubscriberEngagement 実装（TDD）

**Files:**
- Modify: `workers/newsletter/src/routes/tracking.ts`
- Modify: `workers/newsletter/src/__tests__/tracking.test.ts`

**Step 1: テスト追加**

```typescript
// Add to tracking.test.ts
describe('getSubscriberEngagement', () => {
  it('should return engagement history for campaigns and sequences', async () => {
    const env = getTestEnv();

    // Setup subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status)
      VALUES ('sub-1', 'user@example.com', 'Test User', 'active')
    `).run();

    // Setup campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Campaign Subject', '<p>Content</p>', 'sent')
    `).run();

    // Setup sequence
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active)
      VALUES ('seq-1', 'Welcome Series', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
      VALUES ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome content</p>')
    `).run();

    // Setup delivery logs
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at, opened_at)
      VALUES ('dl-1', 'camp-1', 'sub-1', 'user@example.com', 'opened', 1703404800, 1703408400)
    `).run();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at)
      VALUES ('dl-2', 'seq-1', 'step-1', 'sub-1', 'user@example.com', 'delivered', 1703300000)
    `).run();

    // Setup click for campaign
    await env.DB.prepare(`
      INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
      VALUES ('ce-1', 'dl-1', 'sub-1', 'https://example.com/link', 1703410000)
    `).run();

    const { getSubscriberEngagement } = await import('../routes/tracking');
    const result = await getSubscriberEngagement(env, 'sub-1');

    expect(result).not.toBeNull();
    expect(result!.subscriber.email).toBe('user@example.com');
    expect(result!.campaigns).toHaveLength(1);
    expect(result!.campaigns[0].subject).toBe('Campaign Subject');
    expect(result!.campaigns[0].clicks).toHaveLength(1);
    expect(result!.sequences).toHaveLength(1);
    expect(result!.sequences[0].name).toBe('Welcome Series');
    expect(result!.sequences[0].steps).toHaveLength(1);
  });

  it('should return null for non-existent subscriber', async () => {
    const env = getTestEnv();
    const { getSubscriberEngagement } = await import('../routes/tracking');
    const result = await getSubscriberEngagement(env, 'non-existent');
    expect(result).toBeNull();
  });
});
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: FAIL - getSubscriberEngagement not defined

**Step 3: 実装追加**

```typescript
// Add to tracking.ts
interface SubscriberEngagementResponse {
  subscriber: {
    id: string;
    email: string;
    name: string | null;
    status: string;
  };
  campaigns: Array<{
    id: string;
    subject: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    clicks: Array<{ url: string; clicked_at: number }>;
  }>;
  sequences: Array<{
    id: string;
    name: string;
    steps: Array<{
      step_number: number;
      subject: string;
      status: string;
      sent_at: number | null;
      opened_at: number | null;
      clicks: Array<{ url: string; clicked_at: number }>;
    }>;
  }>;
}

export async function getSubscriberEngagement(
  env: Env,
  subscriberId: string
): Promise<SubscriberEngagementResponse | null> {
  // Get subscriber
  const subscriber = await env.DB.prepare(
    'SELECT id, email, name, status FROM subscribers WHERE id = ?'
  ).bind(subscriberId).first<{
    id: string;
    email: string;
    name: string | null;
    status: string;
  }>();

  if (!subscriber) {
    return null;
  }

  // Get campaign delivery logs
  const campaignLogs = await env.DB.prepare(`
    SELECT
      dl.id as delivery_log_id,
      dl.status,
      dl.sent_at,
      dl.opened_at,
      c.id as campaign_id,
      c.subject
    FROM delivery_logs dl
    JOIN campaigns c ON dl.campaign_id = c.id
    WHERE dl.subscriber_id = ? AND dl.campaign_id IS NOT NULL
    ORDER BY dl.sent_at DESC
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    campaign_id: string;
    subject: string;
  }>();

  // Get sequence delivery logs
  const sequenceLogs = await env.DB.prepare(`
    SELECT
      dl.id as delivery_log_id,
      dl.status,
      dl.sent_at,
      dl.opened_at,
      s.id as sequence_id,
      s.name as sequence_name,
      ss.step_number,
      ss.subject
    FROM delivery_logs dl
    JOIN sequences s ON dl.sequence_id = s.id
    JOIN sequence_steps ss ON dl.sequence_step_id = ss.id
    WHERE dl.subscriber_id = ? AND dl.sequence_id IS NOT NULL
    ORDER BY s.id, ss.step_number
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    status: string;
    sent_at: number | null;
    opened_at: number | null;
    sequence_id: string;
    sequence_name: string;
    step_number: number;
    subject: string;
  }>();

  // Get all clicks for this subscriber
  const clicks = await env.DB.prepare(`
    SELECT delivery_log_id, clicked_url, clicked_at
    FROM click_events
    WHERE subscriber_id = ?
    ORDER BY clicked_at DESC
  `).bind(subscriberId).all<{
    delivery_log_id: string;
    clicked_url: string;
    clicked_at: number;
  }>();

  const clicksByLog = new Map<string, Array<{ url: string; clicked_at: number }>>();
  for (const click of clicks.results || []) {
    if (!clicksByLog.has(click.delivery_log_id)) {
      clicksByLog.set(click.delivery_log_id, []);
    }
    clicksByLog.get(click.delivery_log_id)!.push({
      url: click.clicked_url,
      clicked_at: click.clicked_at,
    });
  }

  // Build campaigns array
  const campaigns = (campaignLogs.results || []).map(log => ({
    id: log.campaign_id,
    subject: log.subject,
    status: log.status,
    sent_at: log.sent_at,
    opened_at: log.opened_at,
    clicks: clicksByLog.get(log.delivery_log_id) || [],
  }));

  // Build sequences array (group by sequence)
  const sequenceMap = new Map<string, {
    id: string;
    name: string;
    steps: Array<{
      step_number: number;
      subject: string;
      status: string;
      sent_at: number | null;
      opened_at: number | null;
      clicks: Array<{ url: string; clicked_at: number }>;
    }>;
  }>();

  for (const log of sequenceLogs.results || []) {
    if (!sequenceMap.has(log.sequence_id)) {
      sequenceMap.set(log.sequence_id, {
        id: log.sequence_id,
        name: log.sequence_name,
        steps: [],
      });
    }
    sequenceMap.get(log.sequence_id)!.steps.push({
      step_number: log.step_number,
      subject: log.subject,
      status: log.status,
      sent_at: log.sent_at,
      opened_at: log.opened_at,
      clicks: clicksByLog.get(log.delivery_log_id) || [],
    });
  }

  return {
    subscriber: {
      id: subscriber.id,
      email: subscriber.email,
      name: subscriber.name,
      status: subscriber.status,
    },
    campaigns,
    sequences: Array.from(sequenceMap.values()),
  };
}

export async function handleGetSubscriberEngagement(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!verifyApiKey(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getSubscriberEngagement(env, subscriberId);

  if (!result) {
    return new Response(JSON.stringify({ error: 'Subscriber not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/tracking.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
git add workers/newsletter/src/routes/tracking.ts workers/newsletter/src/__tests__/tracking.test.ts
git commit -m "feat(tracking): add getSubscriberEngagement function with tests"
```

---

## Task 4: ルーティング追加

**Files:**
- Modify: `workers/newsletter/src/index.ts`

**Step 1: インポートとルート追加**

```typescript
// Add to imports in index.ts
import {
  handleGetCampaignTracking,
  handleGetCampaignClicks,
  handleGetSubscriberEngagement,
} from './routes/tracking';

// Add routes before the 404 handler (after existing campaign routes)
// Add these conditions:

// After: else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'DELETE')
// Add:
else if (path.match(/^\/api\/campaigns\/[^\/]+\/tracking$/) && request.method === 'GET') {
  const id = path.replace('/api/campaigns/', '').replace('/tracking', '');
  response = await handleGetCampaignTracking(request, env, id);
} else if (path.match(/^\/api\/campaigns\/[^\/]+\/clicks$/) && request.method === 'GET') {
  const id = path.replace('/api/campaigns/', '').replace('/clicks', '');
  response = await handleGetCampaignClicks(request, env, id);
}

// After subscriber sequence routes, add:
else if (path.match(/^\/api\/subscribers\/[^\/]+\/engagement$/) && request.method === 'GET') {
  const id = path.replace('/api/subscribers/', '').replace('/engagement', '');
  response = await handleGetSubscriberEngagement(request, env, id);
}
```

**Step 2: 全テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: All tests pass

**Step 3: コミット**

```bash
git add workers/newsletter/src/index.ts
git commit -m "feat(routing): add tracking API routes"
```

---

## Task 5: 本番デプロイ

**Step 1: 全テスト確認**

Run: `cd workers/newsletter && npm test`
Expected: All tests pass

**Step 2: デプロイ**

Run: `cd workers/newsletter && npm run deploy`
Expected: Deployed successfully

**Step 3: コミット（最終）**

```bash
git add .
git commit -m "feat: complete Batch 3C tracking API implementation"
```

---

## Summary

| Task | Description | Files |
|:--|:--|:--|
| 1 | getCampaignTracking | tracking.ts, tracking.test.ts |
| 2 | getCampaignClicks | tracking.ts, tracking.test.ts |
| 3 | getSubscriberEngagement | tracking.ts, tracking.test.ts |
| 4 | ルーティング追加 | index.ts |
| 5 | 本番デプロイ | - |

---

*Created: 2024-12-24*
