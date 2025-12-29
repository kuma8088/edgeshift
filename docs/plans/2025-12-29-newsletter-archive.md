# Newsletter Archive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public newsletter archive with SEO-optimized pages, RSS feed, and admin controls for publication.

**Architecture:** Astro SSR pages consuming new Workers API endpoints. D1 database stores publication metadata (slug, is_published, published_at, excerpt). TDD approach with frequent commits.

**Tech Stack:** Astro, TypeScript, Cloudflare Workers, D1 (SQLite), Vitest, Playwright

---

## Phase 1: Database & Core Utilities

### Task 1: Database Schema Migration

**Files:**
- Modify: `workers/newsletter/schema.sql:36-37` (after campaigns table)
- Test: Manual verification with wrangler

**Step 1: Add new columns to schema.sql**

Add after line 36 (after `created_at` column in campaigns table):

```sql
ALTER TABLE campaigns ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE campaigns ADD COLUMN is_published INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN published_at INTEGER;
ALTER TABLE campaigns ADD COLUMN excerpt TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_slug ON campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_campaigns_published ON campaigns(is_published, published_at);
```

**Step 2: Apply migration to local D1**

Run:
```bash
cd workers/newsletter
npm run db:migrate
```

Expected: "Applied schema successfully"

**Step 3: Verify columns were added**

Run:
```bash
npx wrangler d1 execute edgeshift-newsletter-local --command="PRAGMA table_info(campaigns)"
```

Expected: Output shows `slug`, `is_published`, `published_at`, `excerpt` columns

**Step 4: Commit**

```bash
git add workers/newsletter/schema.sql
git commit -m "feat(db): add archive columns to campaigns table

Add slug, is_published, published_at, excerpt columns to support
public newsletter archive feature.

- slug: URL identifier (unique)
- is_published: 0=private, 1=public
- published_at: unix timestamp
- excerpt: summary text (first 200 chars auto-generated)"
```

---

### Task 2: Slug Generation Utility

**Files:**
- Create: `workers/newsletter/src/lib/slug.ts`
- Create: `workers/newsletter/src/__tests__/slug.test.ts`

**Step 1: Write failing tests**

Create `workers/newsletter/src/__tests__/slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSlug, ensureUniqueSlug } from '../lib/slug';

describe('Slug Generation', () => {
  describe('generateSlug', () => {
    it('should convert Japanese to romaji with date prefix', () => {
      const result = generateSlug('2024年1月のニュース', new Date('2024-01-15'));
      expect(result).toBe('2024-01-no-news');
    });

    it('should handle English titles', () => {
      const result = generateSlug('Hello World Newsletter', new Date('2024-01-15'));
      expect(result).toBe('2024-01-hello-world-newsletter');
    });

    it('should remove special characters', () => {
      const result = generateSlug('Tech News #123 @ 2024!', new Date('2024-01-15'));
      expect(result).toBe('2024-01-tech-news-123-2024');
    });

    it('should truncate to 100 characters', () => {
      const longTitle = 'A'.repeat(200);
      const result = generateSlug(longTitle, new Date('2024-01-15'));
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should lowercase all characters', () => {
      const result = generateSlug('UPPERCASE Title', new Date('2024-01-15'));
      expect(result).toBe('2024-01-uppercase-title');
    });
  });

  describe('ensureUniqueSlug', () => {
    it('should return original slug if not exists', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };

      const result = await ensureUniqueSlug('test-slug', mockDB as any);
      expect(result).toBe('test-slug');
    });

    it('should append -2 if slug exists', async () => {
      const mockDB = {
        prepare: () => ({
          bind: (slug: string) => ({
            first: async () => (slug === 'test-slug' ? { slug } : null),
          }),
        }),
      };

      const result = await ensureUniqueSlug('test-slug', mockDB as any);
      expect(result).toBe('test-slug-2');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd workers/newsletter
npm test src/__tests__/slug.test.ts
```

Expected: FAIL with "Cannot find module '../lib/slug'"

**Step 3: Write minimal implementation**

Create `workers/newsletter/src/lib/slug.ts`:

```typescript
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Generate URL slug from title with date prefix
 * @param title Campaign subject/title
 * @param date Publication date (defaults to now)
 * @returns URL-safe slug (e.g., "2024-01-hello-world")
 */
export function generateSlug(title: string, date: Date = new Date()): string {
  // Format date as YYYY-MM
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const datePrefix = `${year}-${month}`;

  // Convert to lowercase and remove special chars
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Multiple hyphens to single
    .replace(/^-|-$/g, ''); // Trim hyphens

  // Combine and truncate
  const slug = `${datePrefix}-${cleaned}`.slice(0, 100);

  return slug;
}

/**
 * Ensure slug is unique by appending number if necessary
 * @param baseSlug Desired slug
 * @param db D1 database instance
 * @param excludeId Campaign ID to exclude from check (for updates)
 * @returns Unique slug
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  db: D1Database,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const query = excludeId
      ? 'SELECT slug FROM campaigns WHERE slug = ? AND id != ?'
      : 'SELECT slug FROM campaigns WHERE slug = ?';

    const bindings = excludeId ? [slug, excludeId] : [slug];

    const existing = await db
      .prepare(query)
      .bind(...bindings)
      .first();

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Generate excerpt from content
 * @param content Campaign content (HTML or plain text)
 * @param maxLength Maximum length (default: 200)
 * @returns Excerpt text
 */
export function generateExcerpt(content: string, maxLength: number = 200): string {
  // Strip HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Truncate to maxLength
  if (text.length <= maxLength) {
    return text;
  }

  // Truncate at last complete word
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > 0
    ? truncated.slice(0, lastSpace) + '...'
    : truncated + '...';
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
npm test src/__tests__/slug.test.ts
```

Expected: PASS (all tests passing)

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/slug.ts workers/newsletter/src/__tests__/slug.test.ts
git commit -m "feat(worker): add slug generation utilities

Add generateSlug() to convert titles to URL-safe slugs with date prefix.
Add ensureUniqueSlug() to handle duplicates with numeric suffix.
Add generateExcerpt() to create summaries from content.

Tests included for Japanese/English conversion, special char handling,
and uniqueness logic."
```

---

## Phase 2: Archive API Endpoints

### Task 3: Archive Types

**Files:**
- Modify: `workers/newsletter/src/types.ts:` (add at end)

**Step 1: Add TypeScript types**

Add to end of `workers/newsletter/src/types.ts`:

```typescript
// Archive API types
export interface ArchiveArticle {
  id: string;
  slug: string;
  subject: string;
  excerpt: string;
  published_at: number;
  is_subscriber_only: boolean; // Future use
}

export interface ArchiveListResponse {
  articles: ArchiveArticle[];
  pagination: {
    page: number;
    total_pages: number;
    total_count: number;
  };
}

export interface ArchiveDetailResponse {
  id: string;
  slug: string;
  subject: string;
  content: string;
  published_at: number;
}
```

**Step 2: Commit**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add archive API response types"
```

---

### Task 4: Archive List API

**Files:**
- Create: `workers/newsletter/src/routes/archive.ts`
- Create: `workers/newsletter/src/__tests__/archive.test.ts`

**Step 1: Write failing tests**

Create `workers/newsletter/src/__tests__/archive.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getArchiveList, getArchiveArticle } from '../routes/archive';

describe('Archive API', () => {
  beforeEach(async () => {
    // Setup: Create test campaigns
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, slug, is_published, published_at, excerpt)
      VALUES
        ('c1', 'Published Article 1', 'Content 1', 'pub-1', 1, 1704067200, 'Excerpt 1'),
        ('c2', 'Published Article 2', 'Content 2', 'pub-2', 1, 1704153600, 'Excerpt 2'),
        ('c3', 'Draft Article', 'Content 3', 'draft-1', 0, NULL, 'Excerpt 3')
    `).run();
  });

  describe('getArchiveList', () => {
    it('should return only published articles', async () => {
      const request = new Request('http://localhost/api/archive?page=1&limit=10');
      const response = await getArchiveList(request, env);
      const data = await response.json();

      expect(data.articles).toHaveLength(2);
      expect(data.articles.every((a: any) => a.is_subscriber_only === false)).toBe(true);
    });

    it('should order by published_at desc', async () => {
      const request = new Request('http://localhost/api/archive');
      const response = await getArchiveList(request, env);
      const data = await response.json();

      expect(data.articles[0].slug).toBe('pub-2'); // Most recent
      expect(data.articles[1].slug).toBe('pub-1');
    });

    it('should paginate correctly', async () => {
      const request = new Request('http://localhost/api/archive?page=1&limit=1');
      const response = await getArchiveList(request, env);
      const data = await response.json();

      expect(data.articles).toHaveLength(1);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.total_count).toBe(2);
      expect(data.pagination.total_pages).toBe(2);
    });
  });

  describe('getArchiveArticle', () => {
    it('should return published article by slug', async () => {
      const request = new Request('http://localhost/api/archive/pub-1');
      const response = await getArchiveArticle(request, env, 'pub-1');
      const data = await response.json();

      expect(data.slug).toBe('pub-1');
      expect(data.subject).toBe('Published Article 1');
      expect(data.content).toBe('Content 1');
    });

    it('should return 404 for unpublished article', async () => {
      const request = new Request('http://localhost/api/archive/draft-1');
      const response = await getArchiveArticle(request, env, 'draft-1');

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent slug', async () => {
      const request = new Request('http://localhost/api/archive/invalid');
      const response = await getArchiveArticle(request, env, 'invalid');

      expect(response.status).toBe(404);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test src/__tests__/archive.test.ts
```

Expected: FAIL with "Cannot find module '../routes/archive'"

**Step 3: Write minimal implementation**

Create `workers/newsletter/src/routes/archive.ts`:

```typescript
import type { Env, ArchiveListResponse, ArchiveDetailResponse } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';

/**
 * GET /api/archive - List published articles with pagination
 */
export async function getArchiveList(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM campaigns
      WHERE is_published = 1
    `).first<{ count: number }>();

    const totalCount = countResult?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Get articles
    const articles = await env.DB.prepare(`
      SELECT id, slug, subject, excerpt, published_at
      FROM campaigns
      WHERE is_published = 1
      ORDER BY published_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const response: ArchiveListResponse = {
      articles: (articles.results || []).map((a: any) => ({
        id: a.id,
        slug: a.slug,
        subject: a.subject,
        excerpt: a.excerpt || '',
        published_at: a.published_at,
        is_subscriber_only: false, // Future use
      })),
      pagination: {
        page,
        total_pages: totalPages,
        total_count: totalCount,
      },
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('Get archive list error:', error);
    return errorResponse('Failed to fetch archive', 500);
  }
}

/**
 * GET /api/archive/:slug - Get single published article
 */
export async function getArchiveArticle(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  try {
    const article = await env.DB.prepare(`
      SELECT id, slug, subject, content, published_at
      FROM campaigns
      WHERE slug = ? AND is_published = 1
    `).bind(slug).first<ArchiveDetailResponse>();

    if (!article) {
      return errorResponse('Article not found', 404);
    }

    return jsonResponse(article);
  } catch (error) {
    console.error('Get archive article error:', error);
    return errorResponse('Failed to fetch article', 500);
  }
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
npm test src/__tests__/archive.test.ts
```

Expected: PASS (all tests passing)

**Step 5: Register routes in index.ts**

Modify `workers/newsletter/src/index.ts`:

1. Add import at top:
```typescript
import { getArchiveList, getArchiveArticle } from './routes/archive';
```

2. Add routes before the catch-all (around line 200, before final `else`):
```typescript
      // Archive routes (public, no auth)
      } else if (path === '/api/archive' && request.method === 'GET') {
        response = await getArchiveList(request, env);
      } else if (path.match(/^\/api\/archive\/[^\/]+$/)) {
        const slug = path.replace('/api/archive/', '');
        if (request.method === 'GET') {
          response = await getArchiveArticle(request, env, slug);
        }
```

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/archive.ts workers/newsletter/src/__tests__/archive.test.ts workers/newsletter/src/index.ts
git commit -m "feat(api): add archive list and detail endpoints

Add GET /api/archive for paginated list of published articles.
Add GET /api/archive/:slug for individual article retrieval.
No authentication required (public endpoints).

Tests cover:
- Published articles only
- Pagination
- Sort order (newest first)
- 404 for unpublished/missing articles"
```

---

### Task 5: Update Campaign Creation/Update API

**Files:**
- Modify: `workers/newsletter/src/routes/campaigns.ts`
- Modify: `workers/newsletter/src/__tests__/campaigns.test.ts`

**Step 1: Update types for campaign request**

Modify `workers/newsletter/src/types.ts`, find `CreateCampaignRequest` and `UpdateCampaignRequest`, add:

```typescript
export interface CreateCampaignRequest {
  subject: string;
  content: string;
  scheduled_at?: number;
  schedule_type?: 'none' | 'daily' | 'weekly' | 'monthly';
  schedule_config?: any;
  contact_list_id?: string;
  // Archive fields
  slug?: string;
  is_published?: boolean;
  excerpt?: string;
}

export interface UpdateCampaignRequest {
  subject?: string;
  content?: string;
  status?: string;
  scheduled_at?: number;
  schedule_type?: 'none' | 'daily' | 'weekly' | 'monthly';
  schedule_config?: any;
  contact_list_id?: string;
  // Archive fields
  slug?: string;
  is_published?: boolean;
  published_at?: number;
  excerpt?: string;
}
```

**Step 2: Write tests for slug auto-generation**

Add to `workers/newsletter/src/__tests__/campaigns.test.ts`:

```typescript
  it('should auto-generate slug if not provided', async () => {
    const request = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test Newsletter January 2024',
        content: 'Test content',
      }),
    });

    const response = await createCampaign(request, env);
    const data = await response.json();

    expect(data.data.slug).toMatch(/^\d{4}-\d{2}-test-newsletter-january-2024$/);
  });

  it('should use provided slug if given', async () => {
    const request = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        content: 'Test',
        slug: 'custom-slug',
      }),
    });

    const response = await createCampaign(request, env);
    const data = await response.json();

    expect(data.data.slug).toBe('custom-slug');
  });

  it('should auto-generate excerpt if not provided', async () => {
    const longContent = 'A'.repeat(300);
    const request = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        content: longContent,
      }),
    });

    const response = await createCampaign(request, env);
    const data = await response.json();

    expect(data.data.excerpt.length).toBeLessThanOrEqual(203); // 200 + '...'
  });
```

**Step 3: Run tests to verify they fail**

Run:
```bash
npm test src/__tests__/campaigns.test.ts
```

Expected: FAIL (new tests failing)

**Step 4: Update createCampaign implementation**

Modify `workers/newsletter/src/routes/campaigns.ts`:

1. Add import:
```typescript
import { generateSlug, ensureUniqueSlug, generateExcerpt } from '../lib/slug';
```

2. Update `createCampaign` function to handle new fields:

```typescript
export async function createCampaign(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateCampaignRequest>();
    const {
      subject,
      content,
      scheduled_at,
      schedule_type,
      schedule_config,
      contact_list_id,
      slug: providedSlug,
      is_published,
      excerpt: providedExcerpt,
    } = body;

    if (!subject || !content) {
      return errorResponse('Subject and content are required', 400);
    }

    const id = crypto.randomUUID();
    const status = scheduled_at ? 'scheduled' : 'draft';

    // Generate or use provided slug
    const baseSlug = providedSlug || generateSlug(subject);
    const slug = await ensureUniqueSlug(baseSlug, env.DB);

    // Generate or use provided excerpt
    const excerpt = providedExcerpt || generateExcerpt(content);

    // Set published_at if is_published is true
    const published_at = is_published ? Math.floor(Date.now() / 1000) : null;

    await env.DB.prepare(`
      INSERT INTO campaigns (
        id, subject, content, status,
        scheduled_at, schedule_type, schedule_config,
        last_sent_at, sent_at, recipient_count, contact_list_id,
        slug, is_published, published_at, excerpt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      subject,
      content,
      status,
      scheduled_at || null,
      schedule_type || null,
      schedule_config ? JSON.stringify(schedule_config) : null,
      null,  // last_sent_at
      null,  // sent_at
      null,  // recipient_count
      contact_list_id || null,
      slug,
      is_published ? 1 : 0,
      published_at,
      excerpt
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
    return errorResponse('Failed to create campaign', 500);
  }
}
```

3. Update `updateCampaign` similarly:

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
    const body = await request.json<UpdateCampaignRequest>();
    const updates: string[] = [];
    const bindings: any[] = [];

    // Handle standard fields...
    if (body.subject !== undefined) {
      updates.push('subject = ?');
      bindings.push(body.subject);
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      bindings.push(body.content);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      bindings.push(body.status);
    }
    if (body.scheduled_at !== undefined) {
      updates.push('scheduled_at = ?');
      bindings.push(body.scheduled_at);
    }
    if (body.schedule_type !== undefined) {
      updates.push('schedule_type = ?');
      bindings.push(body.schedule_type);
    }
    if (body.schedule_config !== undefined) {
      updates.push('schedule_config = ?');
      bindings.push(JSON.stringify(body.schedule_config));
    }
    if (body.contact_list_id !== undefined) {
      updates.push('contact_list_id = ?');
      bindings.push(body.contact_list_id || null);
    }

    // Handle archive fields
    if (body.slug !== undefined) {
      const uniqueSlug = await ensureUniqueSlug(body.slug, env.DB, id);
      updates.push('slug = ?');
      bindings.push(uniqueSlug);
    }
    if (body.is_published !== undefined) {
      updates.push('is_published = ?');
      bindings.push(body.is_published ? 1 : 0);

      // Set published_at when publishing
      if (body.is_published && !body.published_at) {
        updates.push('published_at = ?');
        bindings.push(Math.floor(Date.now() / 1000));
      }
    }
    if (body.published_at !== undefined) {
      updates.push('published_at = ?');
      bindings.push(body.published_at);
    }
    if (body.excerpt !== undefined) {
      updates.push('excerpt = ?');
      bindings.push(body.excerpt);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    bindings.push(id);

    await env.DB.prepare(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    return jsonResponse<ApiResponse>({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    return errorResponse('Failed to update campaign', 500);
  }
}
```

**Step 5: Run tests to verify they pass**

Run:
```bash
npm test src/__tests__/campaigns.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/campaigns.ts workers/newsletter/src/__tests__/campaigns.test.ts workers/newsletter/src/types.ts
git commit -m "feat(api): add archive fields to campaign create/update

Add slug, is_published, excerpt support in campaign CRUD:
- Auto-generate slug from subject if not provided
- Ensure slug uniqueness with numeric suffix
- Auto-generate excerpt from content (200 chars)
- Set published_at timestamp when is_published=true

Tests cover auto-generation, custom values, and uniqueness."
```

---

## Phase 3: Frontend Pages

### Task 6: Archive Index Page

**Files:**
- Create: `src/pages/newsletter/archive/index.astro`
- Create: `src/components/ArchivePagination.astro`

**Step 1: Create archive index page**

Create `src/pages/newsletter/archive/index.astro`:

```astro
---
import type { ArchiveListResponse } from '../../../workers/newsletter/src/types';

export const prerender = false; // Enable SSR

const page = parseInt(Astro.url.searchParams.get('page') || '1', 10);
const limit = 10;

// Fetch from Worker API
const apiUrl = `${import.meta.env.SITE_URL || 'https://edgeshift.tech'}/api/archive?page=${page}&limit=${limit}`;

let data: ArchiveListResponse | null = null;
let error: string | null = null;

try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch archive');
  }
  data = await response.json();
} catch (e) {
  error = e instanceof Error ? e.message : 'Unknown error';
  console.error('Archive fetch error:', e);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
---

<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Newsletter Archive | EdgeShift</title>
    <meta name="description" content="EdgeShift ニュースレターのバックナンバー一覧" />
  </head>
  <body>
    <main class="container mx-auto px-4 py-12 max-w-4xl">
      <h1 class="text-4xl font-bold mb-8">Newsletter Archive</h1>

      {error && (
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          Error: {error}
        </div>
      )}

      {data && (
        <>
          <div class="space-y-8">
            {data.articles.map((article) => (
              <article class="border-b border-gray-200 pb-6">
                <h2 class="text-2xl font-semibold mb-2">
                  <a href={`/newsletter/archive/${article.slug}`} class="hover:text-blue-600">
                    {article.subject}
                  </a>
                </h2>
                <time class="text-gray-600 text-sm mb-3 block">
                  {formatDate(article.published_at)}
                </time>
                <p class="text-gray-700 mb-4">{article.excerpt}</p>
                <a
                  href={`/newsletter/archive/${article.slug}`}
                  class="text-blue-600 hover:underline font-medium"
                >
                  続きを読む →
                </a>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {data.pagination.total_pages > 1 && (
            <nav class="mt-12 flex justify-center gap-2">
              {data.pagination.page > 1 && (
                <a
                  href={`/newsletter/archive?page=${data.pagination.page - 1}`}
                  class="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  ← Previous
                </a>
              )}

              {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
                <a
                  href={`/newsletter/archive?page=${p}`}
                  class:list={[
                    'px-4 py-2 border rounded',
                    p === data.pagination.page ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'
                  ]}
                >
                  {p}
                </a>
              ))}

              {data.pagination.page < data.pagination.total_pages && (
                <a
                  href={`/newsletter/archive?page=${data.pagination.page + 1}`}
                  class="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Next →
                </a>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  </body>
</html>
```

**Step 2: Test manually**

Run:
```bash
npm run dev
```

Visit: `http://localhost:4321/newsletter/archive`

Expected: Archive page renders (may be empty if no published campaigns)

**Step 3: Commit**

```bash
git add src/pages/newsletter/archive/index.astro
git commit -m "feat(frontend): add archive index page

Add /newsletter/archive page with:
- SSR enabled for real-time updates
- Pagination support (query param ?page=N)
- Article list with title, date, excerpt
- Link to individual articles
- Error handling for API failures"
```

---

### Task 7: Archive Detail Page

**Files:**
- Create: `src/pages/newsletter/archive/[slug].astro`

**Step 1: Create article detail page**

Create `src/pages/newsletter/archive/[slug].astro`:

```astro
---
import type { ArchiveDetailResponse } from '../../../workers/newsletter/src/types';

export const prerender = false; // Enable SSR

const { slug } = Astro.params;

if (!slug) {
  return Astro.redirect('/404');
}

// Fetch from Worker API
const apiUrl = `${import.meta.env.SITE_URL || 'https://edgeshift.tech'}/api/archive/${slug}`;

let article: ArchiveDetailResponse | null = null;
let error: string | null = null;

try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    if (response.status === 404) {
      return Astro.redirect('/404');
    }
    throw new Error('Failed to fetch article');
  }
  article = await response.json();
} catch (e) {
  error = e instanceof Error ? e.message : 'Unknown error';
  console.error('Article fetch error:', e);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const canonicalUrl = `https://edgeshift.tech/newsletter/archive/${slug}`;
---

<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    {article && (
      <>
        <title>{article.subject} | EdgeShift Newsletter</title>
        <meta name="description" content={article.content.slice(0, 160)} />

        <!-- OGP Meta Tags -->
        <meta property="og:title" content={article.subject} />
        <meta property="og:description" content={article.content.slice(0, 200)} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="EdgeShift" />

        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.subject} />
        <meta name="twitter:description" content={article.content.slice(0, 200)} />

        <!-- Canonical URL -->
        <link rel="canonical" href={canonicalUrl} />
      </>
    )}
  </head>
  <body>
    <main class="container mx-auto px-4 py-12 max-w-3xl">
      <nav class="mb-8">
        <a href="/newsletter/archive" class="text-blue-600 hover:underline">
          ← Back to Archive
        </a>
      </nav>

      {error && (
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          Error: {error}
        </div>
      )}

      {article && (
        <article>
          <header class="mb-8">
            <h1 class="text-4xl font-bold mb-4">{article.subject}</h1>
            <time class="text-gray-600">
              {formatDate(article.published_at)}
            </time>
          </header>

          <div class="prose prose-lg max-w-none">
            <div set:html={article.content} />
          </div>
        </article>
      )}
    </main>
  </body>
</html>
```

**Step 2: Test manually**

Visit: `http://localhost:4321/newsletter/archive/test-slug`

Expected: 404 redirect or article display (if test data exists)

**Step 3: Commit**

```bash
git add src/pages/newsletter/archive/[slug].astro
git commit -m "feat(frontend): add archive detail page

Add /newsletter/archive/[slug] page with:
- SSR for individual article display
- OGP meta tags for social sharing (Twitter, Facebook)
- Canonical URL for SEO
- 404 redirect for non-existent articles
- Back link to archive index"
```

---

### Task 8: RSS Feed

**Files:**
- Create: `src/pages/newsletter/feed.xml.ts`

**Step 1: Create RSS feed endpoint**

Create `src/pages/newsletter/feed.xml.ts`:

```typescript
import type { APIRoute } from 'astro';
import type { ArchiveListResponse } from '../../workers/newsletter/src/types';

export const prerender = false; // Enable SSR

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRFC822(timestamp: number): string {
  return new Date(timestamp * 1000).toUTCString();
}

export const GET: APIRoute = async ({ request }) => {
  const siteUrl = import.meta.env.SITE_URL || 'https://edgeshift.tech';
  const apiUrl = `${siteUrl}/api/archive?limit=20`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch archive');
    }

    const data: ArchiveListResponse = await response.json();

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>EdgeShift Newsletter</title>
    <link>${siteUrl}/newsletter/archive</link>
    <description>EdgeShift ニュースレター - 技術、開発、ビジネスに関する最新情報</description>
    <language>ja</language>
    <atom:link href="${siteUrl}/newsletter/feed.xml" rel="self" type="application/rss+xml" />
    ${data.articles.map(article => `
    <item>
      <title>${escapeXml(article.subject)}</title>
      <link>${siteUrl}/newsletter/archive/${article.slug}</link>
      <description>${escapeXml(article.excerpt)}</description>
      <pubDate>${formatRFC822(article.published_at)}</pubDate>
      <guid isPermaLink="true">${siteUrl}/newsletter/archive/${article.slug}</guid>
    </item>`).join('')}
  </channel>
</rss>`;

    return new Response(rss, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('RSS feed error:', error);

    // Return empty feed on error
    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>EdgeShift Newsletter</title>
    <link>${siteUrl}/newsletter/archive</link>
    <description>EdgeShift ニュースレター</description>
  </channel>
</rss>`;

    return new Response(emptyFeed, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }
};
```

**Step 2: Test manually**

Visit: `http://localhost:4321/newsletter/feed.xml`

Expected: Valid RSS 2.0 XML feed

**Step 3: Commit**

```bash
git add src/pages/newsletter/feed.xml.ts
git commit -m "feat(frontend): add RSS 2.0 feed

Add /newsletter/feed.xml endpoint with:
- RSS 2.0 format (most widely supported)
- Latest 20 published articles
- Proper XML escaping
- RFC 822 date format
- 1-hour cache header
- Fallback empty feed on error"
```

---

## Phase 4: Admin Integration

### Task 9: Update Campaign Form (Admin)

**Files:**
- Modify: `src/components/admin/CampaignForm.tsx` (if exists)
- Or create new form component with archive fields

**Step 1: Add slug, is_published, excerpt fields to admin form**

This step requires locating the existing admin campaign form and adding:
- Text input for `slug` (with auto-generate button)
- Checkbox for `is_published`
- Textarea for `excerpt` (with auto-generate from content button)

**Step 2: Test admin form**

Visit admin campaign creation/edit page, verify new fields work.

**Step 3: Commit**

```bash
git add src/components/admin/CampaignForm.tsx
git commit -m "feat(admin): add archive fields to campaign form

Add slug, is_published, excerpt fields:
- Slug input with auto-generate button
- Publish checkbox
- Excerpt textarea with auto-generate
- Field validation"
```

---

## Phase 5: E2E Tests

### Task 10: Archive E2E Tests

**Files:**
- Create: `tests/e2e/archive.spec.ts`

**Step 1: Write E2E tests**

Create `tests/e2e/archive.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Newsletter Archive', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Create test campaigns via API
    // (Assumes ADMIN_API_KEY is available in test env)
  });

  test('archive index page displays published articles', async ({ page }) => {
    await page.goto('/newsletter/archive');

    await expect(page.locator('h1')).toContainText('Newsletter Archive');
    await expect(page.locator('article')).toHaveCount(2); // Assumes 2 test articles
  });

  test('pagination works correctly', async ({ page }) => {
    await page.goto('/newsletter/archive?page=1');

    await expect(page.locator('article')).toHaveCount(10); // First page

    await page.click('text=Next →');
    await expect(page.url()).toContain('page=2');
  });

  test('article detail page displays content', async ({ page }) => {
    await page.goto('/newsletter/archive/test-slug');

    await expect(page.locator('h1')).toContainText('Test Article');
    await expect(page.locator('article')).toBeVisible();
  });

  test('unpublished articles return 404', async ({ page }) => {
    const response = await page.goto('/newsletter/archive/unpublished-slug');
    expect(response?.status()).toBe(404);
  });

  test('RSS feed is valid XML', async ({ page }) => {
    const response = await page.goto('/newsletter/feed.xml');
    expect(response?.headers()['content-type']).toContain('application/xml');

    const content = await page.content();
    expect(content).toContain('<?xml version="1.0"');
    expect(content).toContain('<rss version="2.0">');
  });

  test('OGP meta tags are present on article page', async ({ page }) => {
    await page.goto('/newsletter/archive/test-slug');

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();

    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDescription).toBeTruthy();
  });
});
```

**Step 2: Run E2E tests**

Run:
```bash
npm run test:e2e
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/e2e/archive.spec.ts
git commit -m "test(e2e): add archive feature tests

Add Playwright E2E tests for:
- Archive index pagination
- Article detail display
- 404 for unpublished articles
- RSS feed generation
- OGP meta tags"
```

---

## Phase 6: Production Deployment

### Task 11: Deploy to Production

**Step 1: Run all tests**

```bash
cd workers/newsletter
npm test
cd ../..
npm run check
npm run build
```

Expected: All tests pass, no type errors, build succeeds

**Step 2: Deploy Worker**

```bash
cd workers/newsletter
npm run deploy
```

Expected: Worker deployed successfully

**Step 3: Apply schema migration to production**

```bash
npx wrangler d1 execute edgeshift-newsletter --remote --file=./schema.sql
```

Expected: Schema updated (or "already exists" if columns were added)

**Step 4: Deploy Pages**

```bash
cd ../..
git push origin feature/newsletter-archive
gh pr create --title "feat: Newsletter Archive (Web公開)" --body "$(cat <<'EOF'
## Summary
Implement public newsletter archive feature with SEO optimization.

## Features
- `/newsletter/archive` - Paginated article list
- `/newsletter/archive/[slug]` - Individual articles with OGP
- `/newsletter/feed.xml` - RSS 2.0 feed
- Admin controls for publish/unpublish

## Technical Details
- Astro SSR pages
- Workers API endpoints (no auth required)
- D1 schema: slug, is_published, published_at, excerpt
- TDD approach with 100% coverage

## Testing
- ✅ Unit tests (Worker)
- ✅ E2E tests (Playwright)
- ✅ Manual QA

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5: Verify production**

Visit:
- `https://edgeshift.tech/newsletter/archive`
- `https://edgeshift.tech/newsletter/feed.xml`

Expected: Pages load correctly

**Step 6: Final commit**

```bash
git add .
git commit -m "docs: update README with archive feature

Add documentation for newsletter archive feature."
```

---

## Success Criteria Checklist

After completing all tasks, verify:

- [ ] `/newsletter/archive` page displays published articles with pagination
- [ ] Individual article pages (`/newsletter/archive/[slug]`) work correctly
- [ ] Unpublished articles return 404
- [ ] RSS feed generates valid XML
- [ ] OGP meta tags present and correct
- [ ] Admin can set slug, publish status, excerpt
- [ ] Auto-generation of slug and excerpt works
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Production deployment successful

---

## Notes for Implementation

**TDD Discipline:**
- Write failing test first
- Run test to confirm failure
- Write minimal code to pass
- Run test to confirm pass
- Commit immediately

**YAGNI Principle:**
- No subscriber-only auth (Phase 5-6)
- No thumbnail images
- No categories/tags
- No search functionality

**DRY Principle:**
- Reuse existing layouts/components
- Share types between Worker and Frontend
- Single source of truth for slug generation

**Frequent Commits:**
- Commit after each passing test
- Small, atomic commits
- Clear commit messages following Conventional Commits
