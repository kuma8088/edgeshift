# Newsletter Phase 3: 管理画面・トラッキング Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面UI、開封/クリックトラッキング（Resend Webhooks）、ダッシュボードKPIを実装する

**Architecture:**
- Backend: Cloudflare Workers に Webhook 受信と Dashboard API を追加
- Frontend: Astro + React Islands で `/admin` 配下に管理画面を構築
- 認証: Bearer Token（ADMIN_API_KEY）をローカルストレージに保存

**Tech Stack:** Astro, React, TypeScript, Cloudflare Workers, D1, Resend Webhooks

---

## Batch A: Resend Webhooks（Backend）

### Task 1: Webhook 型定義の追加

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Write the Resend Webhook event types**

```typescript
// Add to types.ts

// Resend Webhook Event Types
export type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

export interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Optional fields based on event type
    click?: {
      link: string;
      timestamp: string;
    };
    bounce?: {
      type: 'hard' | 'soft';
      message: string;
    };
  };
}

// Extend Env interface
export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  ADMIN_API_KEY: string;
  ALLOWED_ORIGIN: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  SITE_URL: string;
  RESEND_WEBHOOK_SECRET: string;  // ADD THIS
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Resend webhook event types"
```

---

### Task 2: Webhook 署名検証ユーティリティ

**Files:**
- Create: `workers/newsletter/src/lib/webhook.ts`

**Step 1: Write the failing test**

Create: `workers/newsletter/src/__tests__/webhook.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { verifyWebhookSignature } from '../lib/webhook';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret_key_12345';
  const payload = JSON.stringify({ type: 'email.delivered', data: {} });

  it('should return true for valid signature', async () => {
    // Create valid signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    const signature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const svixHeaders = {
      'svix-id': 'msg_test123',
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(true);
  });

  it('should return false for invalid signature', async () => {
    const svixHeaders = {
      'svix-id': 'msg_test123',
      'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
      'svix-signature': 'v1,invalid_signature',
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(false);
  });

  it('should return false for expired timestamp (>5 minutes)', async () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6+ minutes ago
    const svixHeaders = {
      'svix-id': 'msg_test123',
      'svix-timestamp': oldTimestamp,
      'svix-signature': 'v1,some_signature',
    };

    const result = await verifyWebhookSignature(payload, svixHeaders, secret);
    expect(result).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/webhook.test.ts`
Expected: FAIL with "verifyWebhookSignature is not defined"

**Step 3: Write minimal implementation**

Create: `workers/newsletter/src/lib/webhook.ts`

```typescript
interface SvixHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

const TOLERANCE_IN_SECONDS = 300; // 5 minutes

/**
 * Verify Resend webhook signature using Svix
 * @see https://resend.com/docs/dashboard/webhooks/verify-webhook-signature
 */
export async function verifyWebhookSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string
): Promise<boolean> {
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > TOLERANCE_IN_SECONDS) {
    return false;
  }

  // Parse signatures (can have multiple, comma-separated with version prefix)
  const signatureList = signatures.split(',').map(s => s.trim());
  const v1Signatures = signatureList
    .filter(s => s.startsWith('v1,'))
    .map(s => s.slice(3));

  if (v1Signatures.length === 0) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if any signature matches
    return v1Signatures.some(sig => sig === expectedSignature);
  } catch {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/__tests__/webhook.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/webhook.ts src/__tests__/webhook.test.ts
git commit -m "feat: add webhook signature verification utility"
```

---

### Task 3: delivery_logs の resend_id 検索関数追加

**Files:**
- Modify: `workers/newsletter/src/lib/delivery.ts`
- Modify: `workers/newsletter/schema.sql`

**Step 1: Add test for findDeliveryLogByResendId**

Add to: `workers/newsletter/src/__tests__/delivery.test.ts`

```typescript
describe('findDeliveryLogByResendId', () => {
  it('should find delivery log by resend_id', async () => {
    // Setup: create a delivery log with resend_id
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)
    `).bind(campaignId, 'Test', 'Content', 'sent').run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active').run();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), campaignId, subscriberId, 'test@example.com', 'sent', resendId).run();

    const result = await findDeliveryLogByResendId(env, resendId);

    expect(result).not.toBeNull();
    expect(result?.resend_id).toBe(resendId);
  });

  it('should return null for non-existent resend_id', async () => {
    const result = await findDeliveryLogByResendId(env, 'non_existent');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/delivery.test.ts`
Expected: FAIL with "findDeliveryLogByResendId is not defined"

**Step 3: Add function to delivery.ts**

Add to: `workers/newsletter/src/lib/delivery.ts`

```typescript
/**
 * Find a delivery log by Resend email ID
 */
export async function findDeliveryLogByResendId(
  env: Env,
  resendId: string
): Promise<DeliveryLog | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM delivery_logs WHERE resend_id = ?'
  ).bind(resendId).first<DeliveryLog>();

  return result || null;
}
```

**Step 4: Add index to schema.sql**

Add to: `workers/newsletter/schema.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_delivery_logs_resend_id ON delivery_logs(resend_id);
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/__tests__/delivery.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/delivery.ts schema.sql src/__tests__/delivery.test.ts
git commit -m "feat: add findDeliveryLogByResendId with index"
```

---

### Task 4: Webhook ルートハンドラ実装

**Files:**
- Create: `workers/newsletter/src/routes/webhook.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Write the failing test**

Create: `workers/newsletter/src/__tests__/webhook-handler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../index';

describe('Webhook Handler', () => {
  beforeEach(async () => {
    // Setup test data
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM delivery_logs`),
      env.DB.prepare(`DELETE FROM subscribers`),
      env.DB.prepare(`DELETE FROM campaigns`),
    ]);
  });

  async function createTestSignature(payload: string, timestamp: string) {
    const secret = 'whsec_test_secret';
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    return Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('should return 401 for invalid signature', async () => {
    const payload = JSON.stringify({ type: 'email.delivered', data: {} });

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,invalid',
      },
      body: payload,
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('should update delivery log on email.delivered event', async () => {
    // Setup: create campaign, subscriber, delivery_log
    const campaignId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const logId = crypto.randomUUID();
    const resendId = 're_' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`)
        .bind(campaignId, 'Test', 'Content', 'sent'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`)
        .bind(subscriberId, 'test@example.com', 'active'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(logId, campaignId, subscriberId, 'test@example.com', 'sent', resendId),
    ]);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: resendId,
        to: ['test@example.com'],
      },
    });

    const signature = await createTestSignature(payload, timestamp);

    const request = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });

    // Mock env with test secret
    const testEnv = { ...env, RESEND_WEBHOOK_SECRET: 'whsec_test_secret' };

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    // Verify delivery log was updated
    const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
      .bind(logId).first();
    expect(log?.status).toBe('delivered');
    expect(log?.delivered_at).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/webhook-handler.test.ts`
Expected: FAIL with "404 Not found"

**Step 3: Write the webhook handler**

Create: `workers/newsletter/src/routes/webhook.ts`

```typescript
import type { Env, ResendWebhookEvent, DeliveryStatus } from '../types';
import { verifyWebhookSignature } from '../lib/webhook';
import { findDeliveryLogByResendId, updateDeliveryStatus } from '../lib/delivery';

export async function handleResendWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // Get signature headers
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get raw body
  const payload = await request.text();

  // Verify signature
  const isValid = await verifyWebhookSignature(
    payload,
    {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    },
    env.RESEND_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse event
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`Received webhook event: ${event.type} for email_id: ${event.data.email_id}`);

  // Find delivery log by resend_id (email_id)
  const deliveryLog = await findDeliveryLogByResendId(env, event.data.email_id);

  if (!deliveryLog) {
    // Not found is OK - might be a test email or already processed
    console.log(`No delivery log found for email_id: ${event.data.email_id}`);
    return new Response(JSON.stringify({ success: true, message: 'No matching delivery log' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Map event type to delivery status
  let newStatus: DeliveryStatus | null = null;
  let errorMessage: string | undefined;

  switch (event.type) {
    case 'email.delivered':
      newStatus = 'delivered';
      break;
    case 'email.opened':
      newStatus = 'opened';
      break;
    case 'email.clicked':
      newStatus = 'clicked';
      break;
    case 'email.bounced':
      newStatus = 'bounced';
      errorMessage = event.data.bounce?.message;
      break;
    case 'email.complained':
      newStatus = 'failed';
      errorMessage = 'Spam complaint received';
      break;
    default:
      // Ignore other events
      break;
  }

  if (newStatus) {
    await updateDeliveryStatus(env, deliveryLog.id, newStatus, errorMessage);
    console.log(`Updated delivery log ${deliveryLog.id} to status: ${newStatus}`);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 4: Add route to index.ts**

Add to: `workers/newsletter/src/index.ts`

```typescript
// Add import at top
import { handleResendWebhook } from './routes/webhook';

// Add route in fetch handler (before the else block for 404)
} else if (path === '/api/webhooks/resend' && request.method === 'POST') {
  response = await handleResendWebhook(request, env);
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/__tests__/webhook-handler.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/routes/webhook.ts src/index.ts src/__tests__/webhook-handler.test.ts
git commit -m "feat: add Resend webhook handler"
```

---

### Task 5: wrangler.toml に RESEND_WEBHOOK_SECRET 参照追加

**Files:**
- Modify: `workers/newsletter/wrangler.toml`

**Step 1: Document the secret requirement**

Add comment to `wrangler.toml`:

```toml
# Secrets (set via `wrangler secret put <NAME>`):
# - RESEND_API_KEY
# - TURNSTILE_SECRET_KEY
# - ADMIN_API_KEY
# - RESEND_WEBHOOK_SECRET (for webhook signature verification)
```

**Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "docs: document RESEND_WEBHOOK_SECRET in wrangler.toml"
```

---

## Batch B: Dashboard API

### Task 6: ダッシュボード統計 API

**Files:**
- Create: `workers/newsletter/src/routes/dashboard.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Write the failing test**

Create: `workers/newsletter/src/__tests__/dashboard.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../index';

describe('Dashboard Stats API', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM delivery_logs`),
      env.DB.prepare(`DELETE FROM subscribers`),
      env.DB.prepare(`DELETE FROM campaigns`),
    ]);
  });

  it('should return 401 without authorization', async () => {
    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('should return empty stats for empty database', async () => {
    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.subscribers.total).toBe(0);
    expect(data.data.campaigns.total).toBe(0);
    expect(data.data.delivery.total).toBe(0);
  });

  it('should return correct stats with data', async () => {
    // Create test data
    await env.DB.batch([
      // Subscribers: 2 active, 1 pending, 1 unsubscribed
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s1', 'a1@test.com', 'active'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s2', 'a2@test.com', 'active'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s3', 'p1@test.com', 'pending'),
      env.DB.prepare(`INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)`).bind('s4', 'u1@test.com', 'unsubscribed'),
      // Campaigns: 1 draft, 1 scheduled, 2 sent
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c1', 'Draft', 'c', 'draft'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c2', 'Scheduled', 'c', 'scheduled'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c3', 'Sent1', 'c', 'sent'),
      env.DB.prepare(`INSERT INTO campaigns (id, subject, content, status) VALUES (?, ?, ?, ?)`).bind('c4', 'Sent2', 'c', 'sent'),
      // Delivery logs: 4 delivered, 2 opened, 1 clicked
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status) VALUES (?, ?, ?, ?, ?)`).bind('d1', 'c3', 's1', 'a1@test.com', 'delivered'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status) VALUES (?, ?, ?, ?, ?)`).bind('d2', 'c3', 's2', 'a2@test.com', 'delivered'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status) VALUES (?, ?, ?, ?, ?)`).bind('d3', 'c4', 's1', 'a1@test.com', 'opened'),
      env.DB.prepare(`INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status) VALUES (?, ?, ?, ?, ?)`).bind('d4', 'c4', 's2', 'a2@test.com', 'clicked'),
    ]);

    const request = new Request('http://localhost/api/dashboard/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);

    const { subscribers, campaigns, delivery } = result.data;

    expect(subscribers.total).toBe(4);
    expect(subscribers.active).toBe(2);
    expect(subscribers.pending).toBe(1);
    expect(subscribers.unsubscribed).toBe(1);

    expect(campaigns.total).toBe(4);
    expect(campaigns.draft).toBe(1);
    expect(campaigns.scheduled).toBe(1);
    expect(campaigns.sent).toBe(2);

    expect(delivery.total).toBe(4);
    expect(delivery.delivered).toBe(2);
    expect(delivery.opened).toBe(1);
    expect(delivery.clicked).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/dashboard.test.ts`
Expected: FAIL with "404 Not found"

**Step 3: Write the dashboard handler**

Create: `workers/newsletter/src/routes/dashboard.ts`

```typescript
import type { Env } from '../types';
import { isAuthorized } from '../lib/auth';

interface DashboardStats {
  subscribers: {
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
  };
  campaigns: {
    total: number;
    draft: number;
    scheduled: number;
    sent: number;
  };
  delivery: {
    total: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    openRate: number;
    clickRate: number;
  };
}

export async function getDashboardStats(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get subscriber stats
  const subscriberStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribed
    FROM subscribers
  `).first<{
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
  }>();

  // Get campaign stats
  const campaignStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent
    FROM campaigns
  `).first<{
    total: number;
    draft: number;
    scheduled: number;
    sent: number;
  }>();

  // Get delivery stats
  const deliveryStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
  `).first<{
    total: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  }>();

  // Calculate rates
  const delivered = (deliveryStats?.delivered ?? 0) + (deliveryStats?.opened ?? 0) + (deliveryStats?.clicked ?? 0);
  const opened = (deliveryStats?.opened ?? 0) + (deliveryStats?.clicked ?? 0);
  const clicked = deliveryStats?.clicked ?? 0;

  const openRate = delivered > 0 ? Math.round((opened / delivered) * 100 * 10) / 10 : 0;
  const clickRate = opened > 0 ? Math.round((clicked / opened) * 100 * 10) / 10 : 0;

  const stats: DashboardStats = {
    subscribers: {
      total: subscriberStats?.total ?? 0,
      active: subscriberStats?.active ?? 0,
      pending: subscriberStats?.pending ?? 0,
      unsubscribed: subscriberStats?.unsubscribed ?? 0,
    },
    campaigns: {
      total: campaignStats?.total ?? 0,
      draft: campaignStats?.draft ?? 0,
      scheduled: campaignStats?.scheduled ?? 0,
      sent: campaignStats?.sent ?? 0,
    },
    delivery: {
      total: deliveryStats?.total ?? 0,
      delivered: deliveryStats?.delivered ?? 0,
      opened: deliveryStats?.opened ?? 0,
      clicked: deliveryStats?.clicked ?? 0,
      bounced: deliveryStats?.bounced ?? 0,
      failed: deliveryStats?.failed ?? 0,
      openRate,
      clickRate,
    },
  };

  return new Response(JSON.stringify({ success: true, data: stats }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 4: Add route to index.ts**

Add to: `workers/newsletter/src/index.ts`

```typescript
// Add import at top
import { getDashboardStats } from './routes/dashboard';

// Add route (before else block for 404)
} else if (path === '/api/dashboard/stats' && request.method === 'GET') {
  response = await getDashboardStats(request, env);
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/__tests__/dashboard.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/routes/dashboard.ts src/index.ts src/__tests__/dashboard.test.ts
git commit -m "feat: add dashboard stats API"
```

---

## Batch C: 管理画面基盤（Frontend）

### Task 7: 管理画面用レイアウト作成

**Files:**
- Create: `src/layouts/AdminLayout.astro`

**Step 1: Create AdminLayout**

Create: `src/layouts/AdminLayout.astro`

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
}

const { title } = Astro.props;
const fullTitle = `${title} | EdgeShift Admin`;
---

<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{fullTitle}</title>
  </head>
  <body class="min-h-screen bg-[#f5f5f5]">
    <div class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="w-64 bg-[#1e1e1e] text-white flex-shrink-0">
        <div class="p-4 border-b border-[#333]">
          <a href="/admin" class="text-xl font-bold text-[#7c3aed]">EdgeShift Admin</a>
        </div>
        <nav class="p-4">
          <ul class="space-y-2">
            <li>
              <a href="/admin" class="block px-4 py-2 rounded-lg hover:bg-[#333] transition-colors">
                ダッシュボード
              </a>
            </li>
            <li>
              <a href="/admin/campaigns" class="block px-4 py-2 rounded-lg hover:bg-[#333] transition-colors">
                キャンペーン
              </a>
            </li>
            <li>
              <a href="/admin/sequences" class="block px-4 py-2 rounded-lg hover:bg-[#333] transition-colors">
                シーケンス
              </a>
            </li>
            <li>
              <a href="/admin/subscribers" class="block px-4 py-2 rounded-lg hover:bg-[#333] transition-colors">
                購読者
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="flex-1 p-8">
        <slot />
      </main>
    </div>
  </body>
</html>
```

**Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build success

**Step 3: Commit**

```bash
git add src/layouts/AdminLayout.astro
git commit -m "feat: add AdminLayout for admin pages"
```

---

### Task 8: API クライアントユーティリティ

**Files:**
- Create: `src/utils/admin-api.ts`

**Step 1: Create API client**

Create: `src/utils/admin-api.ts`

```typescript
const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';
const API_KEY_STORAGE_KEY = 'edgeshift_admin_api_key';

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getApiKey() !== null;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiRequest<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'Not authenticated' };
  }

  const { method = 'GET', body } = options;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearApiKey();
        return { success: false, error: 'Authentication failed. Please login again.' };
      }
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

// Dashboard
export async function getDashboardStats() {
  return apiRequest<{
    subscribers: { total: number; active: number; pending: number; unsubscribed: number };
    campaigns: { total: number; draft: number; scheduled: number; sent: number };
    delivery: { total: number; delivered: number; opened: number; clicked: number; openRate: number; clickRate: number };
  }>('/dashboard/stats');
}

// Campaigns
export async function listCampaigns(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest(`/campaigns${queryString ? `?${queryString}` : ''}`);
}

export async function getCampaign(id: string) {
  return apiRequest(`/campaigns/${id}`);
}

export async function createCampaign(data: { subject: string; content: string; scheduled_at?: number }) {
  return apiRequest('/campaigns', { method: 'POST', body: data });
}

export async function updateCampaign(id: string, data: { subject?: string; content?: string; status?: string }) {
  return apiRequest(`/campaigns/${id}`, { method: 'PUT', body: data });
}

export async function deleteCampaign(id: string) {
  return apiRequest(`/campaigns/${id}`, { method: 'DELETE' });
}

export async function sendCampaign(id: string) {
  return apiRequest(`/campaigns/${id}/send`, { method: 'POST' });
}

export async function getCampaignStats(id: string) {
  return apiRequest(`/campaigns/${id}/stats`);
}

// Sequences
export async function listSequences() {
  return apiRequest('/sequences');
}

export async function getSequence(id: string) {
  return apiRequest(`/sequences/${id}`);
}

export async function createSequence(data: { name: string; description?: string; steps: { delay_days: number; subject: string; content: string }[] }) {
  return apiRequest('/sequences', { method: 'POST', body: data });
}

export async function updateSequence(id: string, data: { name?: string; description?: string; is_active?: number }) {
  return apiRequest(`/sequences/${id}`, { method: 'PUT', body: data });
}

export async function deleteSequence(id: string) {
  return apiRequest(`/sequences/${id}`, { method: 'DELETE' });
}

// Subscribers
export async function listSubscribers(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest(`/newsletter/subscribers${queryString ? `?${queryString}` : ''}`);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/utils/admin-api.ts
git commit -m "feat: add admin API client utility"
```

---

### Task 9: 認証コンポーネント

**Files:**
- Create: `src/components/admin/AuthProvider.tsx`
- Create: `src/components/admin/LoginForm.tsx`

**Step 1: Create AuthProvider**

Create: `src/components/admin/AuthProvider.tsx`

```tsx
'use client';

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { isAuthenticated, setApiKey, clearApiKey, apiRequest } from '../../utils/admin-api';
import { LoginForm } from './LoginForm';

interface AuthContextType {
  authenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    if (isAuthenticated()) {
      // Verify the API key is still valid
      apiRequest('/dashboard/stats').then(result => {
        setAuthenticated(result.success);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (apiKey: string): Promise<boolean> => {
    setApiKey(apiKey);
    const result = await apiRequest('/dashboard/stats');
    if (result.success) {
      setAuthenticated(true);
      return true;
    }
    clearApiKey();
    return false;
  };

  const logout = () => {
    clearApiKey();
    setAuthenticated(false);
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-[#525252]">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <AuthContext.Provider value={{ authenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Step 2: Create LoginForm**

Create: `src/components/admin/LoginForm.tsx`

```tsx
'use client';

import { useState, type FormEvent } from 'react';

interface LoginFormProps {
  onLogin: (apiKey: string) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API キーを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    const success = await onLogin(apiKey.trim());
    if (!success) {
      setError('認証に失敗しました。API キーを確認してください。');
    }
    setLoading(false);
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
      <div class="w-full max-w-md">
        <div class="bg-white rounded-2xl shadow-lg p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-[#1e1e1e]">EdgeShift Admin</h1>
            <p class="text-[#525252] mt-2">管理画面にログイン</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div class="mb-6">
              <label
                htmlFor="apiKey"
                class="block text-sm font-medium text-[#525252] mb-2"
              >
                API キー
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
                class="w-full px-4 py-3 border border-[#e5e5e5] rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent
                       transition-all"
              />
            </div>

            {error && (
              <div class="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              class="w-full py-3 bg-[#7c3aed] text-white font-medium rounded-lg
                     hover:bg-[#6d28d9] transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build success

**Step 4: Commit**

```bash
git add src/components/admin/AuthProvider.tsx src/components/admin/LoginForm.tsx
git commit -m "feat: add admin authentication components"
```

---

### Task 10: ダッシュボードページとKPIカード

**Files:**
- Create: `src/pages/admin/index.astro`
- Create: `src/components/admin/Dashboard.tsx`
- Create: `src/components/admin/KPICard.tsx`

**Step 1: Create KPICard component**

Create: `src/components/admin/KPICard.tsx`

```tsx
interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

const colorClasses = {
  default: 'border-[#e5e5e5]',
  success: 'border-l-4 border-l-green-500',
  warning: 'border-l-4 border-l-yellow-500',
  danger: 'border-l-4 border-l-red-500',
};

export function KPICard({ title, value, subtitle, color = 'default' }: KPICardProps) {
  return (
    <div class={`bg-white rounded-lg p-6 shadow-sm border ${colorClasses[color]}`}>
      <p class="text-sm text-[#525252] mb-1">{title}</p>
      <p class="text-3xl font-bold text-[#1e1e1e]">{value}</p>
      {subtitle && (
        <p class="text-xs text-[#a3a3a3] mt-1">{subtitle}</p>
      )}
    </div>
  );
}
```

**Step 2: Create Dashboard component**

Create: `src/components/admin/Dashboard.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getDashboardStats } from '../../utils/admin-api';
import { KPICard } from './KPICard';

interface DashboardStats {
  subscribers: { total: number; active: number; pending: number; unsubscribed: number };
  campaigns: { total: number; draft: number; scheduled: number; sent: number };
  delivery: { total: number; delivered: number; opened: number; clicked: number; openRate: number; clickRate: number };
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    const result = await getDashboardStats();
    if (result.success && result.data) {
      setStats(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load stats');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div class="animate-pulse space-y-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="bg-white rounded-lg p-6 h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="text-center py-12">
        <p class="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchStats}
          class="px-6 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div class="space-y-8">
      <h1 class="text-2xl font-bold text-[#1e1e1e]">ダッシュボード</h1>

      {/* Subscriber Stats */}
      <section>
        <h2 class="text-lg font-medium text-[#525252] mb-4">購読者</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総購読者数" value={stats.subscribers.total} />
          <KPICard title="アクティブ" value={stats.subscribers.active} color="success" />
          <KPICard title="確認待ち" value={stats.subscribers.pending} color="warning" />
          <KPICard title="解除済み" value={stats.subscribers.unsubscribed} color="danger" />
        </div>
      </section>

      {/* Campaign Stats */}
      <section>
        <h2 class="text-lg font-medium text-[#525252] mb-4">キャンペーン</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総キャンペーン" value={stats.campaigns.total} />
          <KPICard title="下書き" value={stats.campaigns.draft} />
          <KPICard title="予約済み" value={stats.campaigns.scheduled} color="warning" />
          <KPICard title="送信済み" value={stats.campaigns.sent} color="success" />
        </div>
      </section>

      {/* Delivery Stats */}
      <section>
        <h2 class="text-lg font-medium text-[#525252] mb-4">配信パフォーマンス</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総配信数" value={stats.delivery.total} />
          <KPICard title="配信完了" value={stats.delivery.delivered} color="success" />
          <KPICard
            title="開封率"
            value={`${stats.delivery.openRate}%`}
            subtitle={`${stats.delivery.opened} 開封`}
          />
          <KPICard
            title="クリック率"
            value={`${stats.delivery.clickRate}%`}
            subtitle={`${stats.delivery.clicked} クリック`}
          />
        </div>
      </section>
    </div>
  );
}
```

**Step 3: Create admin index page**

Create: `src/pages/admin/index.astro`

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { AuthProvider } from '../../components/admin/AuthProvider';
import { Dashboard } from '../../components/admin/Dashboard';
---

<AdminLayout title="ダッシュボード">
  <AuthProvider client:load>
    <Dashboard client:load />
  </AuthProvider>
</AdminLayout>
```

**Step 4: Verify build succeeds**

Run: `npm run build`
Expected: Build success

**Step 5: Commit**

```bash
git add src/pages/admin/index.astro src/components/admin/Dashboard.tsx src/components/admin/KPICard.tsx
git commit -m "feat: add admin dashboard page with KPI cards"
```

---

## Batch D-G: 残りのUIタスク

**Note:** タスク11-18は同様のパターンで実装します。各ページ・コンポーネントの詳細実装は以下のファイル構成に従います：

### Task 11-12: キャンペーン管理UI
- `src/pages/admin/campaigns/index.astro` - 一覧ページ
- `src/pages/admin/campaigns/new.astro` - 新規作成ページ
- `src/pages/admin/campaigns/[id].astro` - 詳細/編集ページ
- `src/components/admin/CampaignList.tsx` - 一覧コンポーネント
- `src/components/admin/CampaignForm.tsx` - フォームコンポーネント
- `src/components/admin/ConfirmModal.tsx` - 確認モーダル

### Task 13-14: シーケンス管理UI
- `src/pages/admin/sequences/index.astro` - 一覧ページ
- `src/pages/admin/sequences/new.astro` - 新規作成ページ
- `src/pages/admin/sequences/[id].astro` - 詳細/編集ページ
- `src/components/admin/SequenceList.tsx` - 一覧コンポーネント
- `src/components/admin/SequenceForm.tsx` - フォームコンポーネント
- `src/components/admin/SequenceStepEditor.tsx` - ステップエディタ

### Task 15: 購読者一覧UI
- `src/pages/admin/subscribers/index.astro` - 一覧ページ
- `src/components/admin/SubscriberList.tsx` - 一覧コンポーネント

### Task 16-18: 統合・デプロイ
- wrangler.toml の確認
- astro.config.mjs の確認
- E2Eテスト実施

---

## デプロイ前チェックリスト

- [ ] `wrangler secret put RESEND_WEBHOOK_SECRET` を実行
- [ ] Resend Dashboard で Webhook を設定
  - URL: `https://edgeshift.tech/api/webhooks/resend`
  - Events: delivered, opened, clicked, bounced
- [ ] 全テスト通過を確認
- [ ] `npm run build` が成功
- [ ] Workers をデプロイ: `cd workers/newsletter && wrangler deploy`
- [ ] Astro をデプロイ（Cloudflare Pages）
