# Newsletter Phase 2: 配信機能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ニュースレターの配信機能を実装し、キャンペーン管理・スケジュール配信・シーケンスメールを提供する

**Architecture:** Cloudflare Workers + D1 でキャンペーン CRUD、Cron Triggers でスケジュール実行、React Email でテンプレート管理。既存の broadcast.ts を拡張し、新規ルート（campaigns, scheduled）を追加。

**Tech Stack:** TypeScript, Cloudflare Workers, D1, Resend API, React Email, Vitest

---

## Prerequisites

テスト環境のセットアップが必要:

```bash
cd workers/newsletter
npm install -D vitest @cloudflare/vitest-pool-workers
```

---

## Batch A: キャンペーン管理とテンプレート

### Task 1: テスト環境セットアップ

**Files:**
- Create: `workers/newsletter/vitest.config.ts`
- Create: `workers/newsletter/src/__tests__/setup.ts`
- Modify: `workers/newsletter/package.json`

**Step 1: Install test dependencies**

Run:
```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter
npm install -D vitest @cloudflare/vitest-pool-workers
```

**Step 2: Create vitest config**

Create `workers/newsletter/vitest.config.ts`:
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

**Step 3: Create test setup file**

Create `workers/newsletter/src/__tests__/setup.ts`:
```typescript
import { env } from 'cloudflare:test';

export function getTestEnv() {
  return {
    DB: env.DB,
    RESEND_API_KEY: 'test-api-key',
    TURNSTILE_SECRET_KEY: 'test-turnstile-key',
    ADMIN_API_KEY: 'test-admin-key',
    ALLOWED_ORIGIN: 'http://localhost:4321',
    SENDER_EMAIL: 'test@example.com',
    SENDER_NAME: 'Test Newsletter',
    SITE_URL: 'http://localhost:4321',
  };
}

export async function setupTestDb() {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'pending',
      confirm_token TEXT,
      unsubscribe_token TEXT,
      subscribed_at INTEGER,
      unsubscribed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      scheduled_at INTEGER,
      schedule_type TEXT,
      schedule_config TEXT,
      last_sent_at INTEGER,
      sent_at INTEGER,
      recipient_count INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      subscriber_id TEXT,
      status TEXT,
      sent_at INTEGER,
      opened_at INTEGER,
      clicked_at INTEGER
    );
  `);
}

export async function cleanupTestDb() {
  await env.DB.exec('DELETE FROM delivery_logs');
  await env.DB.exec('DELETE FROM campaigns');
  await env.DB.exec('DELETE FROM subscribers');
}
```

**Step 4: Update package.json**

Add to `workers/newsletter/package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

**Step 5: Verify setup**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: Test runner initializes (may show 0 tests found)

**Step 6: Commit**

```bash
git add workers/newsletter/vitest.config.ts workers/newsletter/src/__tests__/setup.ts workers/newsletter/package.json
git commit -m "test: add vitest setup for newsletter worker"
```

---

### Task 2: Campaign CRUD - Create API

**Files:**
- Create: `workers/newsletter/src/__tests__/campaigns.test.ts`
- Create: `workers/newsletter/src/routes/campaigns.ts`
- Modify: `workers/newsletter/src/index.ts`
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Write failing test for createCampaign**

Create `workers/newsletter/src/__tests__/campaigns.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { createCampaign } from '../routes/campaigns';

describe('Campaign CRUD', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('createCampaign', () => {
    it('should create a draft campaign', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Hello World</p>',
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.status).toBe('draft');
    });

    it('should return 400 if subject is missing', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ content: '<p>Hello</p>' }),
      });

      const response = await createCampaign(request, env);
      expect(response.status).toBe(400);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Test',
          content: '<p>Hello</p>',
        }),
      });

      const response = await createCampaign(request, env);
      expect(response.status).toBe(401);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: FAIL with "createCampaign is not defined"

**Step 3: Add CreateCampaignRequest type**

Add to `workers/newsletter/src/types.ts`:
```typescript
export interface CreateCampaignRequest {
  subject: string;
  content: string;
  scheduled_at?: number;
  schedule_type?: ScheduleType;
  schedule_config?: ScheduleConfig;
}

export interface UpdateCampaignRequest {
  subject?: string;
  content?: string;
  status?: CampaignStatus;
  scheduled_at?: number;
  schedule_type?: ScheduleType;
  schedule_config?: ScheduleConfig;
}
```

**Step 4: Implement createCampaign**

Create `workers/newsletter/src/routes/campaigns.ts`:
```typescript
import type { Env, Campaign, CreateCampaignRequest, UpdateCampaignRequest, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { jsonResponse, errorResponse, successResponse } from '../lib/response';

export async function createCampaign(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateCampaignRequest>();
    const { subject, content, scheduled_at, schedule_type, schedule_config } = body;

    if (!subject || !content) {
      return errorResponse('Subject and content are required', 400);
    }

    const id = crypto.randomUUID();
    const status = scheduled_at ? 'scheduled' : 'draft';

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      subject,
      content,
      status,
      scheduled_at || null,
      schedule_type || null,
      schedule_config ? JSON.stringify(schedule_config) : null
    ).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    return jsonResponse<ApiResponse>({
      success: true,
      data: campaign,
    }, 201);
  } catch (error) {
    console.error('Create campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/types.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat: add createCampaign API endpoint"
```

---

### Task 3: Campaign CRUD - Get/List APIs

**Files:**
- Modify: `workers/newsletter/src/__tests__/campaigns.test.ts`
- Modify: `workers/newsletter/src/routes/campaigns.ts`

**Step 1: Write failing test for getCampaign and listCampaigns**

Add to `workers/newsletter/src/__tests__/campaigns.test.ts`:
```typescript
import { createCampaign, getCampaign, listCampaigns } from '../routes/campaigns';

describe('getCampaign', () => {
  it('should return a campaign by id', async () => {
    const env = getTestEnv();

    // Create a campaign first
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({
        subject: 'Test Newsletter',
        content: '<p>Hello</p>',
      }),
    });
    const createRes = await createCampaign(createReq, env);
    const created = await createRes.json();
    const campaignId = created.data.id;

    // Get the campaign
    const getReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await getCampaign(getReq, env, campaignId);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.id).toBe(campaignId);
    expect(result.data.subject).toBe('Test Newsletter');
  });

  it('should return 404 for non-existent campaign', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/non-existent', {
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await getCampaign(request, env, 'non-existent');
    expect(response.status).toBe(404);
  });
});

describe('listCampaigns', () => {
  it('should return all campaigns', async () => {
    const env = getTestEnv();

    // Create two campaigns
    for (const subject of ['Campaign 1', 'Campaign 2']) {
      await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject, content: '<p>Content</p>' }),
      }), env);
    }

    const request = new Request('http://localhost/api/campaigns', {
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await listCampaigns(request, env);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.campaigns).toHaveLength(2);
    expect(result.data.total).toBe(2);
  });

  it('should filter by status', async () => {
    const env = getTestEnv();

    // Create a draft campaign
    await createCampaign(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Draft', content: '<p>Draft</p>' }),
    }), env);

    const request = new Request('http://localhost/api/campaigns?status=scheduled', {
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await listCampaigns(request, env);
    const result = await response.json();

    expect(result.data.campaigns).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: FAIL with "getCampaign is not defined"

**Step 3: Implement getCampaign and listCampaigns**

Add to `workers/newsletter/src/routes/campaigns.ts`:
```typescript
export async function getCampaign(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    return successResponse({ data: campaign });
  } catch (error) {
    console.error('Get campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function listCampaigns(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    let query = 'SELECT * FROM campaigns';
    let countQuery = 'SELECT COUNT(*) as count FROM campaigns';
    const bindings: (string | number)[] = [];

    if (status) {
      query += ' WHERE status = ?';
      countQuery += ' WHERE status = ?';
      bindings.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const campaigns = await env.DB.prepare(query)
      .bind(...bindings, limit, offset)
      .all<Campaign>();

    const total = await env.DB.prepare(countQuery)
      .bind(...bindings.slice(0, status ? 1 : 0))
      .first<{ count: number }>();

    return successResponse({
      data: {
        campaigns: campaigns.results || [],
        total: total?.count || 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('List campaigns error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat: add getCampaign and listCampaigns API endpoints"
```

---

### Task 4: Campaign CRUD - Update/Delete APIs

**Files:**
- Modify: `workers/newsletter/src/__tests__/campaigns.test.ts`
- Modify: `workers/newsletter/src/routes/campaigns.ts`

**Step 1: Write failing test for updateCampaign and deleteCampaign**

Add to `workers/newsletter/src/__tests__/campaigns.test.ts`:
```typescript
import { createCampaign, getCampaign, listCampaigns, updateCampaign, deleteCampaign } from '../routes/campaigns';

describe('updateCampaign', () => {
  it('should update campaign subject and content', async () => {
    const env = getTestEnv();

    // Create a campaign
    const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Original', content: '<p>Original</p>' }),
    }), env);
    const created = await createRes.json();
    const campaignId = created.data.id;

    // Update the campaign
    const updateReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Updated', content: '<p>Updated</p>' }),
    });
    const response = await updateCampaign(updateReq, env, campaignId);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.subject).toBe('Updated');
    expect(result.data.content).toBe('<p>Updated</p>');
  });

  it('should not update sent campaign', async () => {
    const env = getTestEnv();

    // Create and manually set as sent
    const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Sent', content: '<p>Sent</p>' }),
    }), env);
    const created = await createRes.json();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?")
      .bind(created.data.id).run();

    // Try to update
    const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Modified' }),
    });
    const response = await updateCampaign(updateReq, env, created.data.id);

    expect(response.status).toBe(400);
  });
});

describe('deleteCampaign', () => {
  it('should delete a draft campaign', async () => {
    const env = getTestEnv();

    // Create a campaign
    const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'To Delete', content: '<p>Delete me</p>' }),
    }), env);
    const created = await createRes.json();
    const campaignId = created.data.id;

    // Delete the campaign
    const deleteReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await deleteCampaign(deleteReq, env, campaignId);

    expect(response.status).toBe(200);

    // Verify it's deleted
    const getRes = await getCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    }), env, campaignId);
    expect(getRes.status).toBe(404);
  });

  it('should not delete sent campaign', async () => {
    const env = getTestEnv();

    const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Sent', content: '<p>Sent</p>' }),
    }), env);
    const created = await createRes.json();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?")
      .bind(created.data.id).run();

    const deleteReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await deleteCampaign(deleteReq, env, created.data.id);

    expect(response.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: FAIL with "updateCampaign is not defined"

**Step 3: Implement updateCampaign and deleteCampaign**

Add to `workers/newsletter/src/routes/campaigns.ts`:
```typescript
export async function updateCampaign(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // Check if campaign exists and is not sent
    const existing = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    if (!existing) {
      return errorResponse('Campaign not found', 404);
    }

    if (existing.status === 'sent') {
      return errorResponse('Cannot update sent campaign', 400);
    }

    const body = await request.json<UpdateCampaignRequest>();
    const updates: string[] = [];
    const bindings: (string | number | null)[] = [];

    if (body.subject !== undefined) {
      updates.push('subject = ?');
      bindings.push(body.subject);
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      bindings.push(body.content);
    }
    if (body.status !== undefined && body.status !== 'sent') {
      updates.push('status = ?');
      bindings.push(body.status);
    }
    if (body.scheduled_at !== undefined) {
      updates.push('scheduled_at = ?');
      bindings.push(body.scheduled_at);
      if (body.scheduled_at && existing.status === 'draft') {
        updates.push("status = 'scheduled'");
      }
    }
    if (body.schedule_type !== undefined) {
      updates.push('schedule_type = ?');
      bindings.push(body.schedule_type);
    }
    if (body.schedule_config !== undefined) {
      updates.push('schedule_config = ?');
      bindings.push(JSON.stringify(body.schedule_config));
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    bindings.push(id);
    await env.DB.prepare(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    return successResponse({ data: updated });
  } catch (error) {
    console.error('Update campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function deleteCampaign(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    if (!existing) {
      return errorResponse('Campaign not found', 404);
    }

    if (existing.status === 'sent') {
      return errorResponse('Cannot delete sent campaign', 400);
    }

    await env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(id).run();

    return successResponse({ message: 'Campaign deleted' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat: add updateCampaign and deleteCampaign API endpoints"
```

---

### Task 5: Router Integration for Campaign APIs

**Files:**
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Write integration test**

Add to `workers/newsletter/src/__tests__/campaigns.test.ts`:
```typescript
import worker from '../index';

describe('Campaign Routes Integration', () => {
  it('should route POST /api/campaigns to createCampaign', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Test', content: '<p>Test</p>' }),
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(201);
  });

  it('should route GET /api/campaigns to listCampaigns', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: FAIL with 404 Not found

**Step 3: Add routes to index.ts**

Update `workers/newsletter/src/index.ts`:
```typescript
import type { Env } from './types';
import { handleSubscribe } from './routes/subscribe';
import { handleConfirm } from './routes/confirm';
import { handleUnsubscribe } from './routes/unsubscribe';
import { handleBroadcast, handleGetSubscribers } from './routes/broadcast';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
} from './routes/campaigns';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response: Response;

      // Campaign routes
      if (path === '/api/campaigns' && request.method === 'POST') {
        response = await createCampaign(request, env);
      } else if (path === '/api/campaigns' && request.method === 'GET') {
        response = await listCampaigns(request, env);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/campaigns/', '');
        response = await getCampaign(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/campaigns/', '');
        response = await updateCampaign(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'DELETE') {
        const id = path.replace('/api/campaigns/', '');
        response = await deleteCampaign(request, env, id);
      }
      // Newsletter routes (existing)
      else if (path === '/api/newsletter/subscribe' && request.method === 'POST') {
        response = await handleSubscribe(request, env);
      } else if (path.startsWith('/api/newsletter/confirm/') && request.method === 'GET') {
        const token = path.replace('/api/newsletter/confirm/', '');
        response = await handleConfirm(request, env, token);
      } else if (path.startsWith('/api/newsletter/unsubscribe/') && request.method === 'GET') {
        const token = path.replace('/api/newsletter/unsubscribe/', '');
        response = await handleUnsubscribe(request, env, token);
      } else if (path === '/api/newsletter/broadcast' && request.method === 'POST') {
        response = await handleBroadcast(request, env);
      } else if (path === '/api/newsletter/subscribers' && request.method === 'GET') {
        response = await handleGetSubscribers(request, env);
      } else {
        response = new Response(
          JSON.stringify({ success: false, error: 'Not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Add CORS headers to response (except redirects)
      if (response.status < 300 || response.status >= 400) {
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      return response;
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/index.ts workers/newsletter/src/__tests__/campaigns.test.ts
git commit -m "feat: integrate campaign routes into worker"
```

---

### Task 6: delivery_logs Table and Recording

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Create: `workers/newsletter/src/lib/delivery.ts`
- Modify: `workers/newsletter/src/routes/broadcast.ts`

**Step 1: Add delivery_logs table to schema**

Add to `workers/newsletter/schema.sql`:
```sql
-- Delivery logs table (Phase 2)
CREATE TABLE IF NOT EXISTS delivery_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  resend_id TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_campaign ON delivery_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_subscriber ON delivery_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);
```

**Step 2: Create delivery lib**

Create `workers/newsletter/src/lib/delivery.ts`:
```typescript
import type { Env, Subscriber } from '../types';

export interface DeliveryLog {
  id: string;
  campaign_id: string;
  subscriber_id: string;
  email: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  resend_id: string | null;
  sent_at: number | null;
  error_message: string | null;
}

export async function recordDeliveryLogs(
  env: Env,
  campaignId: string,
  subscribers: Subscriber[],
  results: { email: string; success: boolean; resendId?: string; error?: string }[]
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const resultMap = new Map(results.map(r => [r.email, r]));

  for (const subscriber of subscribers) {
    const result = resultMap.get(subscriber.email);
    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id, sent_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      campaignId,
      subscriber.id,
      subscriber.email,
      result?.success ? 'sent' : 'failed',
      result?.resendId || null,
      result?.success ? now : null,
      result?.error || null
    ).run();
  }
}

export async function getDeliveryStats(
  env: Env,
  campaignId: string
): Promise<{
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}> {
  const result = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM delivery_logs
    WHERE campaign_id = ?
  `).bind(campaignId).first();

  return {
    total: result?.total || 0,
    sent: result?.sent || 0,
    delivered: result?.delivered || 0,
    opened: result?.opened || 0,
    clicked: result?.clicked || 0,
    bounced: result?.bounced || 0,
    failed: result?.failed || 0,
  };
}
```

**Step 3: Apply schema migration**

Run:
```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter
npm run db:migrate
```

**Step 4: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/src/lib/delivery.ts
git commit -m "feat: add delivery_logs table and recording functions"
```

---

### Task 7: Campaign Send with Delivery Logs

**Files:**
- Create: `workers/newsletter/src/routes/campaign-send.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Write failing test**

Create `workers/newsletter/src/__tests__/campaign-send.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { sendCampaign } from '../routes/campaign-send';

// Mock email sending
vi.mock('../lib/email', () => ({
  sendBatchEmails: vi.fn().mockResolvedValue({ success: true, sent: 1 }),
}));

describe('sendCampaign', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create a test subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'unsub-token')
    `).run();

    // Create a test campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'draft')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
  });

  it('should send a campaign and record delivery logs', async () => {
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-1');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.sent).toBe(1);

    // Check campaign status updated
    const campaign = await env.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
      .bind('camp-1').first();
    expect(campaign?.status).toBe('sent');

    // Check delivery log created
    const logs = await env.DB.prepare('SELECT * FROM delivery_logs WHERE campaign_id = ?')
      .bind('camp-1').all();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].status).toBe('sent');
  });

  it('should not send already sent campaign', async () => {
    const env = getTestEnv();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = 'camp-1'").run();

    const request = new Request('http://localhost/api/campaigns/camp-1/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp-1');
    expect(response.status).toBe(400);
  });
});
```

**Step 2: Implement sendCampaign**

Create `workers/newsletter/src/routes/campaign-send.ts`:
```typescript
import type { Env, Campaign, Subscriber, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';
import { recordDeliveryLogs, getDeliveryStats } from '../lib/delivery';
import { errorResponse, successResponse } from '../lib/response';

function buildNewsletterEmail(
  content: string,
  unsubscribeUrl: string,
  siteUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #1e1e1e; font-size: 24px; margin: 0;">EdgeShift Newsletter</h1>
  </div>
  <div style="margin-bottom: 32px;">
    ${content}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="${siteUrl}" style="color: #7c3aed;">EdgeShift</a><br>
    <a href="${unsubscribeUrl}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>
  `.trim();
}

export async function sendCampaign(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // Get campaign
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    if (campaign.status === 'sent') {
      return errorResponse('Campaign already sent', 400);
    }

    // Get active subscribers
    const subscribersResult = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();

    const subscribers = subscribersResult.results || [];

    if (subscribers.length === 0) {
      return errorResponse('No active subscribers', 400);
    }

    // Prepare emails
    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject: campaign.subject,
      html: buildNewsletterEmail(
        campaign.content,
        `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
        env.SITE_URL
      ),
    }));

    // Send batch emails
    const sendResult = await sendBatchEmails(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      emails
    );

    // Record delivery logs
    const deliveryResults = subscribers.map((sub) => ({
      email: sub.email,
      success: sendResult.success,
      error: sendResult.error,
    }));
    await recordDeliveryLogs(env, campaignId, subscribers, deliveryResults);

    // Update campaign status
    const now = Math.floor(Date.now() / 1000);
    const status = sendResult.success ? 'sent' : 'failed';
    await env.DB.prepare(`
      UPDATE campaigns
      SET status = ?, sent_at = ?, recipient_count = ?
      WHERE id = ?
    `).bind(status, now, sendResult.sent, campaignId).run();

    // Get delivery stats
    const stats = await getDeliveryStats(env, campaignId);

    return successResponse({
      data: {
        campaignId,
        sent: sendResult.sent,
        total: subscribers.length,
        stats,
      },
    });
  } catch (error) {
    console.error('Send campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getCampaignStats(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    const stats = await getDeliveryStats(env, campaignId);

    return successResponse({
      data: {
        campaign,
        stats,
        openRate: stats.total > 0 ? (stats.opened / stats.total * 100).toFixed(2) + '%' : '0%',
        clickRate: stats.total > 0 ? (stats.clicked / stats.total * 100).toFixed(2) + '%' : '0%',
      },
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 3: Add routes to index.ts**

Add to route matching in `workers/newsletter/src/index.ts`:
```typescript
import { sendCampaign, getCampaignStats } from './routes/campaign-send';

// Add these routes after existing campaign routes:
} else if (path.match(/^\/api\/campaigns\/[^\/]+\/send$/) && request.method === 'POST') {
  const id = path.replace('/api/campaigns/', '').replace('/send', '');
  response = await sendCampaign(request, env, id);
} else if (path.match(/^\/api\/campaigns\/[^\/]+\/stats$/) && request.method === 'GET') {
  const id = path.replace('/api/campaigns/', '').replace('/stats', '');
  response = await getCampaignStats(request, env, id);
}
```

**Step 4: Run tests**

Run: `cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter && npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/campaign-send.ts workers/newsletter/src/__tests__/campaign-send.test.ts workers/newsletter/src/index.ts
git commit -m "feat: add campaign send with delivery logs"
```

---

## Batch B: スケジュール配信

### Task 8: Scheduled Handler (Cron Triggers)

**Files:**
- Create: `workers/newsletter/src/scheduled.ts`
- Modify: `workers/newsletter/src/index.ts`
- Modify: `workers/newsletter/wrangler.toml`

**Step 1: Add cron trigger to wrangler.toml**

Add to `workers/newsletter/wrangler.toml`:
```toml
[triggers]
crons = ["*/15 * * * *"]  # Every 15 minutes
```

**Step 2: Create scheduled handler**

Create `workers/newsletter/src/scheduled.ts`:
```typescript
import type { Env, Campaign, ScheduleConfig } from './types';
import { sendCampaignInternal } from './routes/campaign-send';

export async function processScheduledCampaigns(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Process one-time scheduled campaigns
  await processOneTimeCampaigns(env, now);

  // Process recurring campaigns
  await processRecurringCampaigns(env, now);
}

async function processOneTimeCampaigns(env: Env, now: number): Promise<void> {
  const campaigns = await env.DB.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'scheduled'
    AND schedule_type = 'none'
    AND scheduled_at <= ?
  `).bind(now).all<Campaign>();

  for (const campaign of campaigns.results || []) {
    console.log(`Sending one-time campaign: ${campaign.id}`);
    await sendCampaignInternal(env, campaign.id);
  }
}

async function processRecurringCampaigns(env: Env, now: number): Promise<void> {
  const campaigns = await env.DB.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'scheduled'
    AND schedule_type IN ('daily', 'weekly', 'monthly')
  `).all<Campaign>();

  for (const campaign of campaigns.results || []) {
    if (shouldSendNow(campaign, now)) {
      console.log(`Sending recurring campaign: ${campaign.id}`);
      await sendCampaignInternal(env, campaign.id, true); // keepScheduled = true
    }
  }
}

function shouldSendNow(campaign: Campaign, now: number): boolean {
  if (!campaign.schedule_config) return false;

  const config: ScheduleConfig = JSON.parse(campaign.schedule_config);
  const date = new Date(now * 1000);
  const currentHour = date.getUTCHours();
  const currentMinute = date.getUTCMinutes();
  const currentDayOfWeek = date.getUTCDay();
  const currentDayOfMonth = date.getUTCDate();

  // Check if we're within the 15-minute window of the scheduled time
  const scheduledMinuteOfDay = (config.hour || 0) * 60 + (config.minute || 0);
  const currentMinuteOfDay = currentHour * 60 + currentMinute;
  const withinWindow = Math.abs(currentMinuteOfDay - scheduledMinuteOfDay) < 15;

  if (!withinWindow) return false;

  // Check if already sent in this window
  if (campaign.last_sent_at) {
    const lastSentDate = new Date(campaign.last_sent_at * 1000);
    const hoursSinceLastSent = (now - campaign.last_sent_at) / 3600;

    switch (campaign.schedule_type) {
      case 'daily':
        if (hoursSinceLastSent < 20) return false; // Prevent double-send
        break;
      case 'weekly':
        if (hoursSinceLastSent < 144) return false; // ~6 days
        break;
      case 'monthly':
        if (hoursSinceLastSent < 600) return false; // ~25 days
        break;
    }
  }

  // Check day constraints
  switch (campaign.schedule_type) {
    case 'weekly':
      if (config.dayOfWeek !== undefined && currentDayOfWeek !== config.dayOfWeek) {
        return false;
      }
      break;
    case 'monthly':
      if (config.dayOfMonth !== undefined && currentDayOfMonth !== config.dayOfMonth) {
        return false;
      }
      break;
  }

  return true;
}
```

**Step 3: Update index.ts to handle scheduled events**

Modify `workers/newsletter/src/index.ts` export:
```typescript
import { processScheduledCampaigns } from './scheduled';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ... existing fetch handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled event triggered:', event.cron);
    ctx.waitUntil(processScheduledCampaigns(env));
  },
};
```

**Step 4: Update campaign-send.ts with internal function**

Add to `workers/newsletter/src/routes/campaign-send.ts`:
```typescript
export async function sendCampaignInternal(
  env: Env,
  campaignId: string,
  keepScheduled = false
): Promise<{ success: boolean; sent: number; error?: string }> {
  try {
    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(campaignId).first<Campaign>();

    if (!campaign) {
      return { success: false, sent: 0, error: 'Campaign not found' };
    }

    const subscribersResult = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber>();

    const subscribers = subscribersResult.results || [];

    if (subscribers.length === 0) {
      return { success: false, sent: 0, error: 'No subscribers' };
    }

    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject: campaign.subject,
      html: buildNewsletterEmail(
        campaign.content,
        `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
        env.SITE_URL
      ),
    }));

    const sendResult = await sendBatchEmails(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      emails
    );

    const deliveryResults = subscribers.map((sub) => ({
      email: sub.email,
      success: sendResult.success,
      error: sendResult.error,
    }));
    await recordDeliveryLogs(env, campaignId, subscribers, deliveryResults);

    const now = Math.floor(Date.now() / 1000);
    const status = keepScheduled ? 'scheduled' : (sendResult.success ? 'sent' : 'failed');

    await env.DB.prepare(`
      UPDATE campaigns
      SET status = ?, sent_at = ?, last_sent_at = ?, recipient_count = ?
      WHERE id = ?
    `).bind(status, now, now, sendResult.sent, campaignId).run();

    return { success: sendResult.success, sent: sendResult.sent };
  } catch (error) {
    console.error('Send campaign internal error:', error);
    return { success: false, sent: 0, error: String(error) };
  }
}
```

**Step 5: Commit**

```bash
git add workers/newsletter/src/scheduled.ts workers/newsletter/src/index.ts workers/newsletter/src/routes/campaign-send.ts workers/newsletter/wrangler.toml
git commit -m "feat: add scheduled campaign processing with Cron Triggers"
```

---

## Batch C: シーケンスメール

### Task 9: Sequence Tables and Types

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add sequence tables to schema**

Add to `workers/newsletter/schema.sql`:
```sql
-- Sequences table (for step emails)
CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Sequence steps table
CREATE TABLE IF NOT EXISTS sequence_steps (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);

-- Subscriber sequences (progress tracking)
CREATE TABLE IF NOT EXISTS subscriber_sequences (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  UNIQUE(subscriber_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sequences_subscriber ON subscriber_sequences(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_sequences_sequence ON subscriber_sequences(sequence_id);
```

**Step 2: Add types**

Add to `workers/newsletter/src/types.ts`:
```typescript
export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: number;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  subject: string;
  content: string;
  created_at: number;
}

export interface SubscriberSequence {
  id: string;
  subscriber_id: string;
  sequence_id: string;
  current_step: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface CreateSequenceRequest {
  name: string;
  description?: string;
  steps: {
    delay_days: number;
    subject: string;
    content: string;
  }[];
}
```

**Step 3: Apply migration**

Run:
```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter
npm run db:migrate
```

**Step 4: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/src/types.ts
git commit -m "feat: add sequence tables and types"
```

---

### Task 10: Sequence CRUD APIs

**Files:**
- Create: `workers/newsletter/src/routes/sequences.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Implement sequence CRUD**

Create `workers/newsletter/src/routes/sequences.ts`:
```typescript
import type { Env, Sequence, SequenceStep, CreateSequenceRequest, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse, successResponse, jsonResponse } from '../lib/response';

export async function createSequence(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateSequenceRequest>();
    const { name, description, steps } = body;

    if (!name || !steps || steps.length === 0) {
      return errorResponse('Name and at least one step are required', 400);
    }

    const sequenceId = crypto.randomUUID();

    // Create sequence
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, description)
      VALUES (?, ?, ?)
    `).bind(sequenceId, name, description || null).run();

    // Create steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, i + 1, step.delay_days, step.subject, step.content).run();
    }

    const sequence = await getSequenceWithSteps(env, sequenceId);

    return jsonResponse<ApiResponse>({
      success: true,
      data: sequence,
    }, 201);
  } catch (error) {
    console.error('Create sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getSequence(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequence = await getSequenceWithSteps(env, id);

    if (!sequence) {
      return errorResponse('Sequence not found', 404);
    }

    return successResponse({ data: sequence });
  } catch (error) {
    console.error('Get sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function listSequences(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequences = await env.DB.prepare(
      'SELECT * FROM sequences ORDER BY created_at DESC'
    ).all<Sequence>();

    return successResponse({
      data: {
        sequences: sequences.results || [],
        total: sequences.results?.length || 0,
      },
    });
  } catch (error) {
    console.error('List sequences error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function deleteSequence(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequence = await env.DB.prepare(
      'SELECT * FROM sequences WHERE id = ?'
    ).bind(id).first<Sequence>();

    if (!sequence) {
      return errorResponse('Sequence not found', 404);
    }

    // Delete steps first (foreign key)
    await env.DB.prepare('DELETE FROM sequence_steps WHERE sequence_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM subscriber_sequences WHERE sequence_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM sequences WHERE id = ?').bind(id).run();

    return successResponse({ message: 'Sequence deleted' });
  } catch (error) {
    console.error('Delete sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

async function getSequenceWithSteps(env: Env, id: string) {
  const sequence = await env.DB.prepare(
    'SELECT * FROM sequences WHERE id = ?'
  ).bind(id).first<Sequence>();

  if (!sequence) return null;

  const steps = await env.DB.prepare(
    'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number'
  ).bind(id).all<SequenceStep>();

  return {
    ...sequence,
    steps: steps.results || [],
  };
}
```

**Step 2: Add routes to index.ts**

Add to route matching:
```typescript
import { createSequence, getSequence, listSequences, deleteSequence } from './routes/sequences';

// Sequence routes
} else if (path === '/api/sequences' && request.method === 'POST') {
  response = await createSequence(request, env);
} else if (path === '/api/sequences' && request.method === 'GET') {
  response = await listSequences(request, env);
} else if (path.match(/^\/api\/sequences\/[^\/]+$/) && request.method === 'GET') {
  const id = path.replace('/api/sequences/', '');
  response = await getSequence(request, env, id);
} else if (path.match(/^\/api\/sequences\/[^\/]+$/) && request.method === 'DELETE') {
  const id = path.replace('/api/sequences/', '');
  response = await deleteSequence(request, env, id);
}
```

**Step 3: Commit**

```bash
git add workers/newsletter/src/routes/sequences.ts workers/newsletter/src/index.ts
git commit -m "feat: add sequence CRUD APIs"
```

---

### Task 11: Sequence Email Processing

**Files:**
- Create: `workers/newsletter/src/lib/sequence-processor.ts`
- Modify: `workers/newsletter/src/scheduled.ts`
- Modify: `workers/newsletter/src/routes/confirm.ts`

**Step 1: Create sequence processor**

Create `workers/newsletter/src/lib/sequence-processor.ts`:
```typescript
import type { Env, Subscriber, SequenceStep } from '../types';
import { sendEmail } from './email';

interface PendingSequenceEmail {
  subscriber_sequence_id: string;
  subscriber_id: string;
  email: string;
  name: string | null;
  subject: string;
  content: string;
  step_number: number;
  sequence_id: string;
}

export async function processSequenceEmails(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const today = Math.floor(now / 86400) * 86400; // Start of day

  // Find subscribers who need to receive sequence emails
  const pendingEmails = await env.DB.prepare(`
    SELECT
      ss.id as subscriber_sequence_id,
      ss.subscriber_id,
      ss.current_step,
      ss.started_at,
      s.email,
      s.name,
      step.subject,
      step.content,
      step.step_number,
      step.sequence_id
    FROM subscriber_sequences ss
    JOIN subscribers s ON s.id = ss.subscriber_id
    JOIN sequences seq ON seq.id = ss.sequence_id
    JOIN sequence_steps step ON step.sequence_id = ss.sequence_id
    WHERE ss.completed_at IS NULL
    AND s.status = 'active'
    AND seq.is_active = 1
    AND step.step_number = ss.current_step + 1
    AND (ss.started_at + step.delay_days * 86400) <= ?
  `).bind(today).all<PendingSequenceEmail>();

  for (const pending of pendingEmails.results || []) {
    console.log(`Sending sequence email to ${pending.email}, step ${pending.step_number}`);

    const result = await sendEmail(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      {
        to: pending.email,
        subject: pending.subject,
        html: buildSequenceEmail(pending.content, pending.name, env.SITE_URL),
      }
    );

    if (result.success) {
      // Update progress
      const totalSteps = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM sequence_steps WHERE sequence_id = ?'
      ).bind(pending.sequence_id).first<{ count: number }>();

      const isComplete = pending.step_number >= (totalSteps?.count || 0);

      await env.DB.prepare(`
        UPDATE subscriber_sequences
        SET current_step = ?,
            completed_at = ?
        WHERE id = ?
      `).bind(
        pending.step_number,
        isComplete ? now : null,
        pending.subscriber_sequence_id
      ).run();

      console.log(`Sequence step ${pending.step_number} sent to ${pending.email}`);
    } else {
      console.error(`Failed to send sequence email to ${pending.email}:`, result.error);
    }
  }
}

export async function enrollSubscriberInSequences(env: Env, subscriberId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Get all active sequences
  const sequences = await env.DB.prepare(
    'SELECT id FROM sequences WHERE is_active = 1'
  ).all<{ id: string }>();

  for (const seq of sequences.results || []) {
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, started_at)
        VALUES (?, ?, ?, ?)
      `).bind(id, subscriberId, seq.id, now).run();
    } catch (error) {
      // Ignore duplicate key errors (already enrolled)
      console.log(`Subscriber ${subscriberId} already enrolled in sequence ${seq.id}`);
    }
  }
}

function buildSequenceEmail(content: string, name: string | null, siteUrl: string): string {
  const greeting = name ? `${name}さん、` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 16px;">
    ${greeting}
  </div>
  <div style="margin-bottom: 32px;">
    ${content}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="${siteUrl}" style="color: #7c3aed;">EdgeShift</a>
  </p>
</body>
</html>
  `.trim();
}
```

**Step 2: Update scheduled.ts to process sequences**

Add to `workers/newsletter/src/scheduled.ts`:
```typescript
import { processSequenceEmails } from './lib/sequence-processor';

export async function processScheduledCampaigns(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Process one-time scheduled campaigns
  await processOneTimeCampaigns(env, now);

  // Process recurring campaigns
  await processRecurringCampaigns(env, now);

  // Process sequence emails
  await processSequenceEmails(env);
}
```

**Step 3: Update confirm.ts to enroll in sequences**

Add to the end of successful confirmation in `workers/newsletter/src/routes/confirm.ts`:
```typescript
import { enrollSubscriberInSequences } from '../lib/sequence-processor';

// After updating status to 'active':
await enrollSubscriberInSequences(env, subscriber.id);
```

**Step 4: Commit**

```bash
git add workers/newsletter/src/lib/sequence-processor.ts workers/newsletter/src/scheduled.ts workers/newsletter/src/routes/confirm.ts
git commit -m "feat: add sequence email processing and auto-enrollment"
```

---

### Task 12: Sequence Progress API

**Files:**
- Modify: `workers/newsletter/src/routes/sequences.ts`
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Add progress tracking endpoints**

Add to `workers/newsletter/src/routes/sequences.ts`:
```typescript
export async function getSubscriberProgress(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const progress = await env.DB.prepare(`
      SELECT
        ss.id,
        ss.sequence_id,
        ss.current_step,
        ss.started_at,
        ss.completed_at,
        seq.name as sequence_name,
        (SELECT COUNT(*) FROM sequence_steps WHERE sequence_id = ss.sequence_id) as total_steps
      FROM subscriber_sequences ss
      JOIN sequences seq ON seq.id = ss.sequence_id
      WHERE ss.subscriber_id = ?
    `).bind(subscriberId).all();

    return successResponse({
      data: {
        subscriber_id: subscriberId,
        sequences: progress.results || [],
      },
    });
  } catch (error) {
    console.error('Get subscriber progress error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getSequenceSubscribers(
  request: Request,
  env: Env,
  sequenceId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const subscribers = await env.DB.prepare(`
      SELECT
        ss.id,
        ss.subscriber_id,
        ss.current_step,
        ss.started_at,
        ss.completed_at,
        s.email,
        s.name
      FROM subscriber_sequences ss
      JOIN subscribers s ON s.id = ss.subscriber_id
      WHERE ss.sequence_id = ?
      ORDER BY ss.started_at DESC
    `).bind(sequenceId).all();

    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as in_progress
      FROM subscriber_sequences
      WHERE sequence_id = ?
    `).bind(sequenceId).first();

    return successResponse({
      data: {
        sequence_id: sequenceId,
        subscribers: subscribers.results || [],
        stats: {
          total: stats?.total || 0,
          completed: stats?.completed || 0,
          in_progress: stats?.in_progress || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get sequence subscribers error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 2: Add routes**

Add to index.ts route matching:
```typescript
import { getSubscriberProgress, getSequenceSubscribers } from './routes/sequences';

} else if (path.match(/^\/api\/subscribers\/[^\/]+\/sequences$/) && request.method === 'GET') {
  const id = path.replace('/api/subscribers/', '').replace('/sequences', '');
  response = await getSubscriberProgress(request, env, id);
} else if (path.match(/^\/api\/sequences\/[^\/]+\/subscribers$/) && request.method === 'GET') {
  const id = path.replace('/api/sequences/', '').replace('/subscribers', '');
  response = await getSequenceSubscribers(request, env, id);
}
```

**Step 3: Commit**

```bash
git add workers/newsletter/src/routes/sequences.ts workers/newsletter/src/index.ts
git commit -m "feat: add sequence progress tracking APIs"
```

---

## Final Verification

### Run all tests

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/workers/newsletter
npm test -- --run
```

### Deploy to development

```bash
npm run deploy
```

### Test API endpoints

```bash
# Create campaign
curl -X POST https://newsletter.edgeshift.tech/api/campaigns \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Test", "content": "<p>Hello</p>"}'

# List campaigns
curl https://newsletter.edgeshift.tech/api/campaigns \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Create sequence
curl -X POST https://newsletter.edgeshift.tech/api/sequences \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Welcome", "steps": [{"delay_days": 1, "subject": "Welcome!", "content": "<p>Welcome to EdgeShift!</p>"}]}'
```

---

## Summary

| Batch | Tasks | Files Created/Modified | Est. Time |
|:--|:--|:--|:--|
| A | 7 | 12 | 6h |
| B | 1 | 4 | 3h |
| C | 4 | 6 | 5h |
| **Total** | **12** | **22** | **14h** |

---

**Plan complete and saved to `docs/plans/2025-12-23-newsletter-phase2-delivery.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
