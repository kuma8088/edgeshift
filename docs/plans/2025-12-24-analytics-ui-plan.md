# Analytics UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build analytics UI showing campaign/sequence performance metrics with progress bars.

**Architecture:** Two new backend APIs (sequence stats, analytics overview) + three new frontend pages (campaign detail, sequence detail, analytics dashboard). Uses existing Astro + React islands pattern with Tailwind progress bars.

**Tech Stack:** Astro, React, Tailwind CSS, Cloudflare Workers, D1, Vitest

---

## Task 1: Sequence Stats API

**Files:**
- Modify: `workers/newsletter/src/routes/tracking.ts`
- Modify: `workers/newsletter/src/index.ts`
- Create: `workers/newsletter/src/__tests__/sequence-stats.test.ts`

### Step 1: Write the failing test

Create `workers/newsletter/src/__tests__/sequence-stats.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('getSequenceStats', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return step-by-step statistics for a sequence', async () => {
    const env = getTestEnv();

    // Setup subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status)
      VALUES
        ('sub-1', 'user1@example.com', 'active'),
        ('sub-2', 'user2@example.com', 'active'),
        ('sub-3', 'user3@example.com', 'active')
    `).run();

    // Setup sequence
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active)
      VALUES ('seq-1', 'Welcome Series', 1)
    `).run();

    // Setup steps
    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
      VALUES
        ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome</p>'),
        ('step-2', 'seq-1', 2, 1, 'Getting Started', '<p>Guide</p>')
    `).run();

    // Setup subscriber_sequences (enrollments)
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at, completed_at)
      VALUES
        ('ss-1', 'sub-1', 'seq-1', 2, 1703300000, 1703500000),
        ('ss-2', 'sub-2', 'seq-1', 2, 1703300000, NULL),
        ('ss-3', 'sub-3', 'seq-1', 1, 1703300000, NULL)
    `).run();

    // Setup delivery logs for steps
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at, opened_at)
      VALUES
        ('dl-1', 'seq-1', 'step-1', 'sub-1', 'user1@example.com', 'opened', 1703300000, 1703301000),
        ('dl-2', 'seq-1', 'step-1', 'sub-2', 'user2@example.com', 'clicked', 1703300000, 1703301000),
        ('dl-3', 'seq-1', 'step-1', 'sub-3', 'user3@example.com', 'delivered', 1703300000, NULL),
        ('dl-4', 'seq-1', 'step-2', 'sub-1', 'user1@example.com', 'opened', 1703400000, 1703401000),
        ('dl-5', 'seq-1', 'step-2', 'sub-2', 'user2@example.com', 'delivered', 1703400000, NULL)
    `).run();

    const { getSequenceStats } = await import('../routes/tracking');
    const result = await getSequenceStats(env, 'seq-1');

    expect(result).not.toBeNull();
    expect(result!.sequence_id).toBe('seq-1');
    expect(result!.total_enrolled).toBe(3);
    expect(result!.completed).toBe(1);
    expect(result!.in_progress).toBe(2);
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0]).toMatchObject({
      step_number: 1,
      subject: 'Welcome!',
      sent: 3,
    });
  });

  it('should return null for non-existent sequence', async () => {
    const env = getTestEnv();
    const { getSequenceStats } = await import('../routes/tracking');
    const result = await getSequenceStats(env, 'non-existent');
    expect(result).toBeNull();
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/feat-analytics-ui/workers/newsletter
npm test src/__tests__/sequence-stats.test.ts
```

Expected: FAIL with "getSequenceStats is not a function"

### Step 3: Write minimal implementation

Add to `workers/newsletter/src/routes/tracking.ts`:

```typescript
interface SequenceStatsResponse {
  sequence_id: string;
  name: string;
  total_enrolled: number;
  completed: number;
  in_progress: number;
  steps: Array<{
    step_number: number;
    subject: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    open_rate: number;
    click_rate: number;
  }>;
}

export async function getSequenceStats(
  env: Env,
  sequenceId: string
): Promise<SequenceStatsResponse | null> {
  // Get sequence
  const sequence = await env.DB.prepare(
    'SELECT id, name FROM sequences WHERE id = ?'
  ).bind(sequenceId).first<{ id: string; name: string }>();

  if (!sequence) {
    return null;
  }

  // Get enrollment stats
  const enrollmentStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as in_progress
    FROM subscriber_sequences
    WHERE sequence_id = ?
  `).bind(sequenceId).first<{
    total: number;
    completed: number;
    in_progress: number;
  }>();

  // Get steps with stats
  const stepsResult = await env.DB.prepare(`
    SELECT
      ss.step_number,
      ss.subject,
      COUNT(dl.id) as sent,
      SUM(CASE WHEN dl.status IN ('delivered', 'opened', 'clicked') THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN dl.status IN ('opened', 'clicked') THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN dl.status = 'clicked' THEN 1 ELSE 0 END) as clicked
    FROM sequence_steps ss
    LEFT JOIN delivery_logs dl ON dl.sequence_step_id = ss.id
    WHERE ss.sequence_id = ?
    GROUP BY ss.id, ss.step_number, ss.subject
    ORDER BY ss.step_number
  `).bind(sequenceId).all<{
    step_number: number;
    subject: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
  }>();

  const steps = (stepsResult.results || []).map(step => {
    const openRate = step.delivered > 0 ? (step.opened / step.delivered) * 100 : 0;
    const clickRate = step.delivered > 0 ? (step.clicked / step.delivered) * 100 : 0;
    return {
      ...step,
      open_rate: Math.round(openRate * 10) / 10,
      click_rate: Math.round(clickRate * 10) / 10,
    };
  });

  return {
    sequence_id: sequence.id,
    name: sequence.name,
    total_enrolled: enrollmentStats?.total || 0,
    completed: enrollmentStats?.completed || 0,
    in_progress: enrollmentStats?.in_progress || 0,
    steps,
  };
}

export async function handleGetSequenceStats(
  request: Request,
  env: Env,
  sequenceId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getSequenceStats(env, sequenceId);

  if (!result) {
    return errorResponse('Sequence not found', 404);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Step 4: Run test to verify it passes

```bash
npm test src/__tests__/sequence-stats.test.ts
```

Expected: PASS

### Step 5: Add route to index.ts

Add import and route in `workers/newsletter/src/index.ts`:

```typescript
// Add to imports
import {
  handleGetCampaignTracking,
  handleGetCampaignClicks,
  handleGetSubscriberEngagement,
  handleGetSequenceStats,  // ADD THIS
} from './routes/tracking';

// Add route (after existing sequence routes, before newsletter routes)
} else if (path.match(/^\/api\/sequences\/[^\/]+\/stats$/) && request.method === 'GET') {
  const id = path.replace('/api/sequences/', '').replace('/stats', '');
  response = await handleGetSequenceStats(request, env, id);
}
```

### Step 6: Run all tests

```bash
npm test
```

Expected: All tests pass

### Step 7: Commit

```bash
git add workers/newsletter/src/routes/tracking.ts workers/newsletter/src/index.ts workers/newsletter/src/__tests__/sequence-stats.test.ts
git commit -m "feat: add sequence stats API for step-by-step analytics

- GET /api/sequences/:id/stats returns enrollment and step metrics
- Includes open/click rates per step
- TDD implementation with tests"
```

---

## Task 2: Analytics Overview API

**Files:**
- Create: `workers/newsletter/src/routes/analytics.ts`
- Modify: `workers/newsletter/src/index.ts`
- Create: `workers/newsletter/src/__tests__/analytics.test.ts`

### Step 1: Write the failing test

Create `workers/newsletter/src/__tests__/analytics.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('getAnalyticsOverview', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return aggregated analytics data', async () => {
    const env = getTestEnv();

    // Setup subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status)
      VALUES
        ('sub-1', 'user1@example.com', 'active'),
        ('sub-2', 'user2@example.com', 'active')
    `).run();

    // Setup campaigns
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, sent_at)
      VALUES
        ('camp-1', 'December Newsletter', '<p>Content</p>', 'sent', 1703404800),
        ('camp-2', 'November Newsletter', '<p>Content</p>', 'sent', 1700812800)
    `).run();

    // Setup delivery logs
    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status)
      VALUES
        ('dl-1', 'camp-1', 'sub-1', 'user1@example.com', 'opened'),
        ('dl-2', 'camp-1', 'sub-2', 'user2@example.com', 'clicked'),
        ('dl-3', 'camp-2', 'sub-1', 'user1@example.com', 'delivered')
    `).run();

    // Setup sequences
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active)
      VALUES ('seq-1', 'Welcome', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, completed_at)
      VALUES
        ('ss-1', 'sub-1', 'seq-1', 2, 1703500000),
        ('ss-2', 'sub-2', 'seq-1', 1, NULL)
    `).run();

    // Setup click events
    await env.DB.prepare(`
      INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
      VALUES
        ('ce-1', 'dl-2', 'sub-2', 'https://example.com', 1703405000),
        ('ce-2', 'dl-2', 'sub-2', 'https://example.com/2', 1703406000)
    `).run();

    const { getAnalyticsOverview } = await import('../routes/analytics');
    const result = await getAnalyticsOverview(env);

    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0].subject).toBe('December Newsletter');
    expect(result.sequences).toHaveLength(1);
    expect(result.sequences[0].enrolled).toBe(2);
    expect(result.top_subscribers).toBeDefined();
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test src/__tests__/analytics.test.ts
```

Expected: FAIL

### Step 3: Write minimal implementation

Create `workers/newsletter/src/routes/analytics.ts`:

```typescript
import type { Env } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse } from '../lib/response';

interface AnalyticsOverviewResponse {
  campaigns: Array<{
    id: string;
    subject: string;
    sent_at: number | null;
    recipient_count: number;
    open_rate: number;
    click_rate: number;
  }>;
  sequences: Array<{
    id: string;
    name: string;
    enrolled: number;
    completion_rate: number;
    avg_open_rate: number;
  }>;
  top_subscribers: Array<{
    id: string;
    email: string;
    open_count: number;
    click_count: number;
  }>;
}

export async function getAnalyticsOverview(env: Env): Promise<AnalyticsOverviewResponse> {
  // Get recent sent campaigns with stats
  const campaignsResult = await env.DB.prepare(`
    SELECT
      c.id,
      c.subject,
      c.sent_at,
      COUNT(dl.id) as recipient_count,
      SUM(CASE WHEN dl.status IN ('opened', 'clicked') THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN dl.status = 'clicked' THEN 1 ELSE 0 END) as clicked
    FROM campaigns c
    LEFT JOIN delivery_logs dl ON dl.campaign_id = c.id
    WHERE c.status = 'sent'
    GROUP BY c.id
    ORDER BY c.sent_at DESC
    LIMIT 10
  `).all<{
    id: string;
    subject: string;
    sent_at: number | null;
    recipient_count: number;
    opened: number;
    clicked: number;
  }>();

  const campaigns = (campaignsResult.results || []).map(c => ({
    id: c.id,
    subject: c.subject,
    sent_at: c.sent_at,
    recipient_count: c.recipient_count,
    open_rate: c.recipient_count > 0 ? Math.round((c.opened / c.recipient_count) * 1000) / 10 : 0,
    click_rate: c.recipient_count > 0 ? Math.round((c.clicked / c.recipient_count) * 1000) / 10 : 0,
  }));

  // Get sequences with stats
  const sequencesResult = await env.DB.prepare(`
    SELECT
      s.id,
      s.name,
      COUNT(ss.id) as enrolled,
      SUM(CASE WHEN ss.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed
    FROM sequences s
    LEFT JOIN subscriber_sequences ss ON ss.sequence_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY enrolled DESC
  `).all<{
    id: string;
    name: string;
    enrolled: number;
    completed: number;
  }>();

  const sequences = (sequencesResult.results || []).map(s => ({
    id: s.id,
    name: s.name,
    enrolled: s.enrolled,
    completion_rate: s.enrolled > 0 ? Math.round((s.completed / s.enrolled) * 1000) / 10 : 0,
    avg_open_rate: 0, // Calculated separately if needed
  }));

  // Get top engaged subscribers
  const topSubscribersResult = await env.DB.prepare(`
    SELECT
      s.id,
      s.email,
      COUNT(DISTINCT CASE WHEN dl.status IN ('opened', 'clicked') THEN dl.id END) as open_count,
      COUNT(DISTINCT ce.id) as click_count
    FROM subscribers s
    LEFT JOIN delivery_logs dl ON dl.subscriber_id = s.id
    LEFT JOIN click_events ce ON ce.subscriber_id = s.id
    WHERE s.status = 'active'
    GROUP BY s.id
    HAVING open_count > 0 OR click_count > 0
    ORDER BY click_count DESC, open_count DESC
    LIMIT 10
  `).all<{
    id: string;
    email: string;
    open_count: number;
    click_count: number;
  }>();

  return {
    campaigns,
    sequences,
    top_subscribers: topSubscribersResult.results || [],
  };
}

export async function handleGetAnalyticsOverview(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await getAnalyticsOverview(env);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Step 4: Run test to verify it passes

```bash
npm test src/__tests__/analytics.test.ts
```

Expected: PASS

### Step 5: Add route to index.ts

```typescript
// Add to imports
import { handleGetAnalyticsOverview } from './routes/analytics';

// Add route (before the 404 handler)
} else if (path === '/api/analytics/overview' && request.method === 'GET') {
  response = await handleGetAnalyticsOverview(request, env);
}
```

### Step 6: Run all tests

```bash
npm test
```

Expected: All tests pass

### Step 7: Commit

```bash
git add workers/newsletter/src/routes/analytics.ts workers/newsletter/src/index.ts workers/newsletter/src/__tests__/analytics.test.ts
git commit -m "feat: add analytics overview API

- GET /api/analytics/overview returns aggregated dashboard data
- Includes recent campaigns, sequences, and top subscribers
- TDD implementation with tests"
```

---

## Task 3: Update Admin API Client

**Files:**
- Modify: `src/utils/admin-api.ts`

### Step 1: Add new API functions

Add to `src/utils/admin-api.ts`:

```typescript
// Tracking
export async function getCampaignTracking(id: string) {
  return apiRequest(`/campaigns/${id}/tracking`);
}

export async function getCampaignClicks(id: string) {
  return apiRequest(`/campaigns/${id}/clicks`);
}

export async function getSequenceStats(id: string) {
  return apiRequest(`/sequences/${id}/stats`);
}

export async function getSequenceSubscribers(id: string) {
  return apiRequest(`/sequences/${id}/subscribers`);
}

export async function getSubscriberEngagement(id: string) {
  return apiRequest(`/subscribers/${id}/engagement`);
}

// Analytics
export async function getAnalyticsOverview() {
  return apiRequest('/analytics/overview');
}
```

### Step 2: Commit

```bash
git add src/utils/admin-api.ts
git commit -m "feat: add tracking and analytics API functions to admin client"
```

---

## Task 4: Create ProgressBar Component

**Files:**
- Create: `src/components/admin/ProgressBar.tsx`

### Step 1: Create component

Create `src/components/admin/ProgressBar.tsx`:

```typescript
interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md';
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

const colorClasses = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  color = 'blue',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1">
          {label && (
            <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
          )}
          {showPercentage && (
            <span className="text-sm font-medium text-[var(--color-text)]">
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${sizeClasses[size]}`}>
        <div
          className={`${colorClasses[color]} ${sizeClasses[size]} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add src/components/admin/ProgressBar.tsx
git commit -m "feat: add ProgressBar component for analytics visualizations"
```

---

## Task 5: Campaign Detail Page

**Files:**
- Create: `src/pages/admin/campaigns/[id].astro`
- Create: `src/components/admin/CampaignDetail.tsx`

### Step 1: Create React component

Create `src/components/admin/CampaignDetail.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getCampaign, getCampaignTracking, getCampaignClicks } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface CampaignDetailProps {
  campaignId: string;
}

interface Campaign {
  id: string;
  subject: string;
  status: string;
  sent_at: number | null;
}

interface TrackingStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
}

interface ClickEvent {
  email: string;
  name: string | null;
  url: string;
  clicked_at: number;
}

interface ClicksSummary {
  total_clicks: number;
  unique_clickers: number;
  unique_urls: number;
}

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [clicks, setClicks] = useState<ClickEvent[]>([]);
  const [clicksSummary, setClicksSummary] = useState<ClicksSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [campaignRes, trackingRes, clicksRes] = await Promise.all([
          getCampaign(campaignId),
          getCampaignTracking(campaignId),
          getCampaignClicks(campaignId),
        ]);

        if (campaignRes.success && campaignRes.data) {
          setCampaign(campaignRes.data as Campaign);
        }
        if (trackingRes.success && trackingRes.data) {
          const data = trackingRes.data as { stats: TrackingStats };
          setStats(data.stats);
        }
        if (clicksRes.success && clicksRes.data) {
          const data = clicksRes.data as { summary: ClicksSummary; clicks: ClickEvent[] };
          setClicksSummary(data.summary);
          setClicks(data.clicks);
        }
      } catch (err) {
        setError('Failed to load campaign data');
      }
      setLoading(false);
    };

    fetchData();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || 'Campaign not found'}</p>
        <a href="/admin/campaigns" className="text-[var(--color-accent)] mt-4 inline-block">
          ← キャンペーン一覧に戻る
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{campaign.subject}</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {campaign.sent_at
              ? `送信日: ${new Date(campaign.sent_at * 1000).toLocaleString('ja-JP')}`
              : 'ステータス: ' + campaign.status}
          </p>
        </div>
        <a
          href="/admin/campaigns"
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-tertiary)]"
        >
          ← 戻る
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
          <h2 className="text-lg font-medium mb-4">配信統計</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">送信</p>
              <p className="text-2xl font-bold">{stats.total_sent}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">配信</p>
              <p className="text-2xl font-bold">{stats.delivered}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">開封</p>
              <p className="text-2xl font-bold">{stats.opened}</p>
              <ProgressBar value={stats.open_rate} color="green" size="sm" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">クリック</p>
              <p className="text-2xl font-bold">{stats.clicked}</p>
              <ProgressBar value={stats.click_rate} color="blue" size="sm" />
            </div>
          </div>
        </div>
      )}

      {/* Click Details */}
      {clicksSummary && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
          <h2 className="text-lg font-medium mb-4">クリック詳細</h2>
          <div className="flex gap-6 mb-4 text-sm">
            <span>総クリック: <strong>{clicksSummary.total_clicks}</strong></span>
            <span>ユニーク: <strong>{clicksSummary.unique_clickers}人</strong></span>
            <span>URL数: <strong>{clicksSummary.unique_urls}</strong></span>
          </div>
          {clicks.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 text-sm font-medium">購読者</th>
                  <th className="text-left py-2 text-sm font-medium">URL</th>
                  <th className="text-left py-2 text-sm font-medium">日時</th>
                </tr>
              </thead>
              <tbody>
                {clicks.slice(0, 20).map((click, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 text-sm">{click.name || click.email}</td>
                    <td className="py-2 text-sm text-[var(--color-text-secondary)] truncate max-w-xs">
                      {click.url}
                    </td>
                    <td className="py-2 text-sm text-[var(--color-text-muted)]">
                      {new Date(click.clicked_at * 1000).toLocaleString('ja-JP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[var(--color-text-muted)]">クリックデータがありません</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 2: Create Astro page

Create `src/pages/admin/campaigns/[id].astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { AuthProvider } from '../../../components/admin/AuthProvider';
import { CampaignDetail } from '../../../components/admin/CampaignDetail';

const { id } = Astro.params;
---

<AdminLayout title="キャンペーン詳細">
  <AuthProvider client:load>
    <CampaignDetail client:load campaignId={id!} />
  </AuthProvider>
</AdminLayout>
```

### Step 3: Add link from campaign list

Modify `src/components/admin/CampaignList.tsx` - add view link after subject:

```typescript
// In the campaign card, after the subject h3, add:
{campaign.status === 'sent' && (
  <a
    href={`/admin/campaigns/${campaign.id}`}
    className="text-sm text-[var(--color-accent)] hover:underline ml-2"
  >
    詳細
  </a>
)}
```

### Step 4: Commit

```bash
git add src/pages/admin/campaigns/\[id\].astro src/components/admin/CampaignDetail.tsx src/components/admin/CampaignList.tsx
git commit -m "feat: add campaign detail page with tracking stats and click history"
```

---

## Task 6: Sequence Detail Page

**Files:**
- Create: `src/pages/admin/sequences/[id].astro`
- Create: `src/components/admin/SequenceDetail.tsx`

### Step 1: Create React component

Create `src/components/admin/SequenceDetail.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getSequence, getSequenceStats, getSequenceSubscribers } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface SequenceDetailProps {
  sequenceId: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
}

interface StepStats {
  step_number: number;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
}

interface SequenceStats {
  total_enrolled: number;
  completed: number;
  in_progress: number;
  steps: StepStats[];
}

interface Subscriber {
  subscriber_id: string;
  email: string;
  name: string | null;
  current_step: number;
  completed_at: number | null;
}

export function SequenceDetail({ sequenceId }: SequenceDetailProps) {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [stats, setStats] = useState<SequenceStats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [seqRes, statsRes, subsRes] = await Promise.all([
          getSequence(sequenceId),
          getSequenceStats(sequenceId),
          getSequenceSubscribers(sequenceId),
        ]);

        if (seqRes.success && seqRes.data) {
          setSequence(seqRes.data as Sequence);
        }
        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data as SequenceStats);
        }
        if (subsRes.success && subsRes.data) {
          const data = subsRes.data as { subscribers: Subscriber[] };
          setSubscribers(data.subscribers || []);
        }
      } catch (err) {
        setError('Failed to load sequence data');
      }
      setLoading(false);
    };

    fetchData();
  }, [sequenceId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || 'Sequence not found'}</p>
        <a href="/admin/sequences" className="text-[var(--color-accent)] mt-4 inline-block">
          ← シーケンス一覧に戻る
        </a>
      </div>
    );
  }

  const completionRate = stats && stats.total_enrolled > 0
    ? (stats.completed / stats.total_enrolled) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{sequence.name}</h1>
          {sequence.description && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{sequence.description}</p>
          )}
        </div>
        <a
          href="/admin/sequences"
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-tertiary)]"
        >
          ← 戻る
        </a>
      </div>

      {/* Overall Stats */}
      {stats && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
          <h2 className="text-lg font-medium mb-4">全体統計</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">登録者</p>
              <p className="text-2xl font-bold">{stats.total_enrolled}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">完了</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <ProgressBar value={completionRate} color="green" size="sm" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">進行中</p>
              <p className="text-2xl font-bold">{stats.in_progress}</p>
            </div>
          </div>
        </div>
      )}

      {/* Step Analysis */}
      {stats && stats.steps.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
          <h2 className="text-lg font-medium mb-4">ステップ別分析</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 text-sm font-medium w-12">#</th>
                <th className="text-left py-2 text-sm font-medium">件名</th>
                <th className="text-left py-2 text-sm font-medium w-20">送信</th>
                <th className="text-left py-2 text-sm font-medium w-32">開封率</th>
                <th className="text-left py-2 text-sm font-medium w-32">クリック率</th>
              </tr>
            </thead>
            <tbody>
              {stats.steps.map((step) => (
                <tr key={step.step_number} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-3 text-sm">{step.step_number}</td>
                  <td className="py-3 text-sm">{step.subject}</td>
                  <td className="py-3 text-sm">{step.sent}</td>
                  <td className="py-3">
                    <ProgressBar value={step.open_rate} color="green" size="sm" />
                  </td>
                  <td className="py-3">
                    <ProgressBar value={step.click_rate} color="blue" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subscribers */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <h2 className="text-lg font-medium mb-4">登録者一覧</h2>
        {subscribers.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 text-sm font-medium">メール</th>
                <th className="text-left py-2 text-sm font-medium w-24">現在のステップ</th>
                <th className="text-left py-2 text-sm font-medium w-24">状態</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.slice(0, 20).map((sub) => (
                <tr key={sub.subscriber_id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 text-sm">{sub.name || sub.email}</td>
                  <td className="py-2 text-sm">Step {sub.current_step}</td>
                  <td className="py-2 text-sm">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      sub.completed_at ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {sub.completed_at ? '完了' : '進行中'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[var(--color-text-muted)]">登録者がいません</p>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Create Astro page

Create `src/pages/admin/sequences/[id].astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { AuthProvider } from '../../../components/admin/AuthProvider';
import { SequenceDetail } from '../../../components/admin/SequenceDetail';

const { id } = Astro.params;
---

<AdminLayout title="シーケンス詳細">
  <AuthProvider client:load>
    <SequenceDetail client:load sequenceId={id!} />
  </AuthProvider>
</AdminLayout>
```

### Step 3: Add link from sequence list

Modify `src/components/admin/SequenceList.tsx` to add view link.

### Step 4: Commit

```bash
git add src/pages/admin/sequences/\[id\].astro src/components/admin/SequenceDetail.tsx src/components/admin/SequenceList.tsx
git commit -m "feat: add sequence detail page with step analysis and subscribers"
```

---

## Task 7: Analytics Dashboard Page

**Files:**
- Create: `src/pages/admin/analytics/index.astro`
- Create: `src/components/admin/AnalyticsDashboard.tsx`

### Step 1: Create React component

Create `src/components/admin/AnalyticsDashboard.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getAnalyticsOverview } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface Campaign {
  id: string;
  subject: string;
  sent_at: number | null;
  recipient_count: number;
  open_rate: number;
  click_rate: number;
}

interface Sequence {
  id: string;
  name: string;
  enrolled: number;
  completion_rate: number;
}

interface TopSubscriber {
  id: string;
  email: string;
  open_count: number;
  click_count: number;
}

interface AnalyticsData {
  campaigns: Campaign[];
  sequences: Sequence[];
  top_subscribers: TopSubscriber[];
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const result = await getAnalyticsOverview();
      if (result.success && result.data) {
        setData(result.data as AnalyticsData);
      } else {
        setError(result.error || 'Failed to load analytics');
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="h-64 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">分析ダッシュボード</h1>

      {/* Campaign Performance */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <h2 className="text-lg font-medium mb-4">キャンペーン実績（直近10件）</h2>
        {data.campaigns.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 text-sm font-medium">件名</th>
                <th className="text-left py-2 text-sm font-medium w-20">送信</th>
                <th className="text-left py-2 text-sm font-medium w-32">開封率</th>
                <th className="text-left py-2 text-sm font-medium w-32">CTR</th>
                <th className="text-left py-2 text-sm font-medium w-24">日付</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-3 text-sm">
                    <a href={`/admin/campaigns/${c.id}`} className="text-[var(--color-accent)] hover:underline">
                      {c.subject}
                    </a>
                  </td>
                  <td className="py-3 text-sm">{c.recipient_count}</td>
                  <td className="py-3">
                    <ProgressBar value={c.open_rate} color="green" size="sm" />
                  </td>
                  <td className="py-3">
                    <ProgressBar value={c.click_rate} color="blue" size="sm" />
                  </td>
                  <td className="py-3 text-sm text-[var(--color-text-muted)]">
                    {c.sent_at ? new Date(c.sent_at * 1000).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[var(--color-text-muted)]">送信済みキャンペーンがありません</p>
        )}
      </div>

      {/* Sequence Performance */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <h2 className="text-lg font-medium mb-4">シーケンス実績</h2>
        {data.sequences.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 text-sm font-medium">名前</th>
                <th className="text-left py-2 text-sm font-medium w-24">登録</th>
                <th className="text-left py-2 text-sm font-medium w-32">完了率</th>
              </tr>
            </thead>
            <tbody>
              {data.sequences.map((s) => (
                <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-3 text-sm">
                    <a href={`/admin/sequences/${s.id}`} className="text-[var(--color-accent)] hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className="py-3 text-sm">{s.enrolled}</td>
                  <td className="py-3">
                    <ProgressBar value={s.completion_rate} color="green" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[var(--color-text-muted)]">アクティブなシーケンスがありません</p>
        )}
      </div>

      {/* Top Engaged Subscribers */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <h2 className="text-lg font-medium mb-4">エンゲージメント上位</h2>
        {data.top_subscribers.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 text-sm font-medium">購読者</th>
                <th className="text-left py-2 text-sm font-medium w-24">開封</th>
                <th className="text-left py-2 text-sm font-medium w-24">クリック</th>
              </tr>
            </thead>
            <tbody>
              {data.top_subscribers.map((s) => (
                <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-3 text-sm">{s.email}</td>
                  <td className="py-3 text-sm">{s.open_count}</td>
                  <td className="py-3 text-sm">{s.click_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[var(--color-text-muted)]">エンゲージメントデータがありません</p>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Create Astro page

Create `src/pages/admin/analytics/index.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { AuthProvider } from '../../../components/admin/AuthProvider';
import { AnalyticsDashboard } from '../../../components/admin/AnalyticsDashboard';
---

<AdminLayout title="分析ダッシュボード">
  <AuthProvider client:load>
    <AnalyticsDashboard client:load />
  </AuthProvider>
</AdminLayout>
```

### Step 3: Add navigation link

Add analytics link to admin navigation/sidebar.

### Step 4: Commit

```bash
git add src/pages/admin/analytics/index.astro src/components/admin/AnalyticsDashboard.tsx
git commit -m "feat: add analytics dashboard page with campaign and sequence performance"
```

---

## Task 8: Deploy and Verify

### Step 1: Deploy Worker

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/feat-analytics-ui/workers/newsletter
npm run deploy
```

### Step 2: Build Frontend

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/feat-analytics-ui
npm run build
```

### Step 3: Verify no build errors

Expected: Build completes successfully

### Step 4: Final commit

```bash
git add -A
git commit -m "chore: prepare for deployment"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Sequence Stats API | 15 min |
| 2 | Analytics Overview API | 15 min |
| 3 | Admin API Client | 5 min |
| 4 | ProgressBar Component | 5 min |
| 5 | Campaign Detail Page | 20 min |
| 6 | Sequence Detail Page | 20 min |
| 7 | Analytics Dashboard | 15 min |
| 8 | Deploy and Verify | 10 min |

**Total: ~2 hours**
