# URL Shortener Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gmail 迷惑メール判定回避のため、メール本文内の全リンクを自社ドメイン経由の短縮URLに変換する。

**Architecture:** メール送信時に `shortenUrls()` でHTML内の全リンクを抽出し、`short_urls` テーブルに登録、href を `edgeshift.tech/r/{code}` に置換。`/r/:code` エンドポイントで302リダイレクト。

**Tech Stack:** Cloudflare Workers, D1 (SQLite), TypeScript

**Design Doc:** `/docs/plans/2026-01-23-url-shortener-design.md` (edgeshift-premium)

---

## Task 1: Add short_urls Table Schema

**Files:**
- Modify: `workers/newsletter/schema.sql`

**Step 1: Add table definition**

Add to end of `schema.sql`:

```sql
-- Short URLs for link tracking (Issue #132)
CREATE TABLE IF NOT EXISTS short_urls (
  id TEXT PRIMARY KEY,
  short_code TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  position INTEGER NOT NULL,
  campaign_id TEXT,
  sequence_step_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id)
);

CREATE INDEX IF NOT EXISTS idx_short_urls_code ON short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_short_urls_campaign ON short_urls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_short_urls_step ON short_urls(sequence_step_id);
```

**Step 2: Apply schema locally**

Run: `npm run db:migrate`
Expected: Success (no errors)

**Step 3: Verify table created**

Run: `npx wrangler d1 execute edgeshift-newsletter --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name='short_urls'"`
Expected: `short_urls` in output

**Step 4: Commit**

```
git add schema.sql
git commit -m "feat: add short_urls table schema for URL shortening (#132)"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add ShortUrl interface**

Add after other interfaces:

```typescript
// Short URLs (Issue #132)
export interface ShortUrl {
  id: string;
  short_code: string;
  original_url: string;
  position: number;
  campaign_id: string | null;
  sequence_step_id: string | null;
  created_at: number;
}

export interface CreateShortUrlParams {
  originalUrl: string;
  position: number;
  campaignId?: string;
  sequenceStepId?: string;
}
```

**Step 2: Commit**

```
git add src/types.ts
git commit -m "feat: add ShortUrl type definitions (#132)"
```

---

## Task 3: Implement URL Shortener Library

**Files:**
- Create: `workers/newsletter/src/lib/url-shortener.ts`
- Create: `workers/newsletter/src/__tests__/url-shortener.test.ts`

**Step 1: Write failing tests**

Create `src/__tests__/url-shortener.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateShortCode, extractUrls, isExcludedUrl, replaceUrlsWithShortened } from '../lib/url-shortener';
import { createTestEnv, cleanupTestDb } from './setup';
import type { Env } from '../types';

describe('URL Shortener', () => {
  describe('generateShortCode', () => {
    it('should generate 8 character alphanumeric code', () => {
      const code = generateShortCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateShortCode());
      }
      expect(codes.size).toBe(100);
    });
  });

  describe('extractUrls', () => {
    it('should extract URLs from anchor tags', () => {
      const html = '<p>Check <a href="https://zenn.dev/article">this</a> out</p>';
      const urls = extractUrls(html);
      expect(urls).toEqual([{ url: 'https://zenn.dev/article', position: 1 }]);
    });

    it('should extract multiple URLs with positions', () => {
      const html = '<a href="https://zenn.dev">Link 1</a><a href="https://example.com">Link 2</a><a href="https://zenn.dev">Link 3</a>';
      const urls = extractUrls(html);
      expect(urls).toEqual([
        { url: 'https://zenn.dev', position: 1 },
        { url: 'https://example.com', position: 2 },
        { url: 'https://zenn.dev', position: 3 },
      ]);
    });

    it('should handle HTML with no links', () => {
      const html = '<p>No links here</p>';
      const urls = extractUrls(html);
      expect(urls).toEqual([]);
    });
  });

  describe('isExcludedUrl', () => {
    it('should exclude mailto links', () => {
      expect(isExcludedUrl('mailto:test@example.com')).toBe(true);
    });

    it('should exclude tel links', () => {
      expect(isExcludedUrl('tel:+1234567890')).toBe(true);
    });

    it('should exclude unsubscribe links', () => {
      expect(isExcludedUrl('https://edgeshift.tech/api/newsletter/unsubscribe/token123')).toBe(true);
    });

    it('should not exclude regular URLs', () => {
      expect(isExcludedUrl('https://zenn.dev/article')).toBe(false);
      expect(isExcludedUrl('https://edgeshift.tech/about')).toBe(false);
    });
  });

  describe('replaceUrlsWithShortened', () => {
    let env: Env;

    beforeEach(async () => {
      env = await createTestEnv();
    });

    afterEach(async () => {
      await cleanupTestDb(env);
    });

    it('should replace URLs with shortened versions', async () => {
      const html = '<a href="https://zenn.dev/article">Click here</a>';
      const result = await replaceUrlsWithShortened(env, html, { campaignId: 'camp_123' });

      expect(result.html).toMatch(/<a href="https:\/\/edgeshift\.tech\/r\/[A-Za-z0-9]{8}">Click here<\/a>/);
      expect(result.shortUrls).toHaveLength(1);
      expect(result.shortUrls[0].original_url).toBe('https://zenn.dev/article');
      expect(result.shortUrls[0].position).toBe(1);
    });

    it('should not replace excluded URLs', async () => {
      const html = '<a href="mailto:test@example.com">Email</a>';
      const result = await replaceUrlsWithShortened(env, html, {});

      expect(result.html).toBe(html);
      expect(result.shortUrls).toHaveLength(0);
    });

    it('should assign different codes to same URL at different positions', async () => {
      const html = '<a href="https://zenn.dev">First</a><a href="https://zenn.dev">Second</a>';
      const result = await replaceUrlsWithShortened(env, html, { campaignId: 'camp_123' });

      expect(result.shortUrls).toHaveLength(2);
      expect(result.shortUrls[0].short_code).not.toBe(result.shortUrls[1].short_code);
      expect(result.shortUrls[0].position).toBe(1);
      expect(result.shortUrls[1].position).toBe(2);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test src/__tests__/url-shortener.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement url-shortener.ts**

Create `src/lib/url-shortener.ts`:

```typescript
import type { Env, ShortUrl, CreateShortUrlParams } from '../types';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 8;
const MAX_RETRIES = 3;
const SHORT_URL_BASE = 'https://edgeshift.tech/r';

/**
 * Generate a random 8-character alphanumeric code
 */
export function generateShortCode(): string {
  const array = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => CHARS[byte % CHARS.length]).join('');
}

/**
 * Extract URLs from anchor tags in HTML with their positions
 */
export function extractUrls(html: string): Array<{ url: string; position: number }> {
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const urls: Array<{ url: string; position: number }> = [];
  let match: RegExpExecArray | null;
  let position = 0;

  while ((match = regex.exec(html)) !== null) {
    position++;
    urls.push({ url: match[1], position });
  }

  return urls;
}

/**
 * Check if URL should be excluded from shortening
 */
export function isExcludedUrl(url: string): boolean {
  if (url.startsWith('mailto:') || url.startsWith('tel:')) {
    return true;
  }
  if (url.includes('/api/newsletter/unsubscribe')) {
    return true;
  }
  return false;
}

/**
 * Create a short URL record in the database
 */
async function createShortUrl(
  env: Env,
  params: CreateShortUrlParams
): Promise<ShortUrl> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const id = crypto.randomUUID();
    const shortCode = generateShortCode();
    const now = Math.floor(Date.now() / 1000);

    try {
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, campaign_id, sequence_step_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        shortCode,
        params.originalUrl,
        params.position,
        params.campaignId || null,
        params.sequenceStepId || null,
        now
      ).run();

      return {
        id,
        short_code: shortCode,
        original_url: params.originalUrl,
        position: params.position,
        campaign_id: params.campaignId || null,
        sequence_step_id: params.sequenceStepId || null,
        created_at: now,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        console.warn(`Short code collision, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to generate unique short code after max retries');
}

export interface ReplaceUrlsOptions {
  campaignId?: string;
  sequenceStepId?: string;
}

export interface ReplaceUrlsResult {
  html: string;
  shortUrls: ShortUrl[];
}

/**
 * Replace all URLs in HTML with shortened versions
 */
export async function replaceUrlsWithShortened(
  env: Env,
  html: string,
  options: ReplaceUrlsOptions
): Promise<ReplaceUrlsResult> {
  const urls = extractUrls(html);
  const shortUrls: ShortUrl[] = [];
  let result = html;

  for (const { url, position } of urls) {
    if (isExcludedUrl(url)) {
      continue;
    }

    try {
      const shortUrl = await createShortUrl(env, {
        originalUrl: url,
        position,
        campaignId: options.campaignId,
        sequenceStepId: options.sequenceStepId,
      });

      shortUrls.push(shortUrl);

      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hrefRegex = new RegExp(`href=["']${escapedUrl}["']`, 'i');
      result = result.replace(hrefRegex, `href="${SHORT_URL_BASE}/${shortUrl.short_code}"`);
    } catch (error) {
      console.error(`Failed to shorten URL ${url}:`, error);
    }
  }

  return { html: result, shortUrls };
}

/**
 * Find a short URL by its code
 */
export async function findShortUrlByCode(
  env: Env,
  code: string
): Promise<ShortUrl | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM short_urls WHERE short_code = ?'
  ).bind(code).first<ShortUrl>();

  return result || null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test src/__tests__/url-shortener.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git add src/lib/url-shortener.ts src/__tests__/url-shortener.test.ts
git commit -m "feat: implement URL shortener library with tests (#132)"
```

---

## Task 4: Implement Redirect Handler

**Files:**
- Create: `workers/newsletter/src/routes/redirect.ts`
- Create: `workers/newsletter/src/__tests__/redirect.test.ts`

**Step 1: Write failing tests**

Create `src/__tests__/redirect.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleRedirect } from '../routes/redirect';
import { createTestEnv, cleanupTestDb } from './setup';
import type { Env } from '../types';

describe('Redirect Handler', () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
    await env.DB.prepare(`
      INSERT INTO short_urls (id, short_code, original_url, position, campaign_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'test-id-1',
      'abc12345',
      'https://zenn.dev/article/123',
      1,
      'camp_test',
      Math.floor(Date.now() / 1000)
    ).run();
  });

  afterEach(async () => {
    await cleanupTestDb(env);
  });

  it('should redirect to original URL for valid code', async () => {
    const request = new Request('https://edgeshift.tech/r/abc12345');
    const response = await handleRedirect(request, env, 'abc12345');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://zenn.dev/article/123');
  });

  it('should return 404 for invalid code', async () => {
    const request = new Request('https://edgeshift.tech/r/notfound');
    const response = await handleRedirect(request, env, 'notfound');
    expect(response.status).toBe(404);
  });

  it('should return 400 for missing code', async () => {
    const request = new Request('https://edgeshift.tech/r/');
    const response = await handleRedirect(request, env, '');
    expect(response.status).toBe(400);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test src/__tests__/redirect.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement redirect handler**

Create `src/routes/redirect.ts`:

```typescript
import type { Env } from '../types';
import { findShortUrlByCode } from '../lib/url-shortener';

/**
 * Handle redirect requests for short URLs
 * GET /r/:code -> 302 redirect to original URL
 */
export async function handleRedirect(
  request: Request,
  env: Env,
  code: string
): Promise<Response> {
  if (!code) {
    return new Response('Bad Request: Missing code', { status: 400 });
  }

  const shortUrl = await findShortUrlByCode(env, code);

  if (!shortUrl) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: shortUrl.original_url,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test src/__tests__/redirect.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
git add src/routes/redirect.ts src/__tests__/redirect.test.ts
git commit -m "feat: implement redirect handler for short URLs (#132)"
```

---

## Task 5: Register Redirect Route

**Files:**
- Modify: `workers/newsletter/src/index.ts`
- Modify: `workers/newsletter/wrangler.toml`

**Step 1: Add route handler to index.ts**

Import at top:

```typescript
import { handleRedirect } from './routes/redirect';
```

Add route matching (add early in the route matching section, before other `/api/*` routes):

```typescript
// Short URL redirect (public, no auth)
if (method === 'GET' && path.match(/^\/r\/([A-Za-z0-9]+)$/)) {
  const code = path.split('/')[2];
  return handleRedirect(request, env, code);
}
```

**Step 2: Add route to wrangler.toml**

Add to routes array:

```toml
{ pattern = "edgeshift.tech/r/*", zone_name = "edgeshift.tech" },
```

**Step 3: Commit**

```
git add src/index.ts wrangler.toml
git commit -m "feat: register redirect route for short URLs (#132)"
```

---

## Task 6: Integrate URL Shortening into Email Rendering

**Files:**
- Modify: `workers/newsletter/src/lib/templates/index.ts`

**Step 1: Add import and update interface**

Add import at top:

```typescript
import type { Env } from '../../types';
import { replaceUrlsWithShortened } from '../url-shortener';
```

Update `RenderEmailOptions` interface:

```typescript
export interface RenderEmailOptions {
  templateId: string;
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriber: { name: string | null; email: string };
  unsubscribeUrl: string;
  siteUrl: string;
  shortenUrls?: boolean;
  campaignId?: string;
  sequenceStepId?: string;
  env?: Env;
}
```

**Step 2: Add renderEmailAsync function**

Add after existing renderEmail:

```typescript
export async function renderEmailAsync(options: RenderEmailOptions): Promise<string> {
  const { templateId, content, subject, brandSettings, subscriber, unsubscribeUrl, siteUrl } = options;

  const processedContent = replaceVariables(content, {
    subscriberName: subscriber.name,
    unsubscribeUrl,
  });

  const linkedContent = linkifyUrls(processedContent);
  let finalContent = processEmptyParagraphs(linkedContent);

  if (options.shortenUrls && options.env) {
    const result = await replaceUrlsWithShortened(options.env, finalContent, {
      campaignId: options.campaignId,
      sequenceStepId: options.sequenceStepId,
    });
    finalContent = result.html;
  }

  const validTemplateId: TemplateId = isValidTemplateId(templateId) ? templateId : 'simple';

  return renderPreset(validTemplateId, {
    content: finalContent,
    subject,
    brandSettings,
    subscriberName: subscriber.name,
    unsubscribeUrl,
    siteUrl,
  });
}
```

**Step 3: Commit**

```
git add src/lib/templates/index.ts
git commit -m "feat: add async renderEmailAsync with URL shortening support (#132)"
```

---

## Task 7: Update Campaign Send to Use URL Shortening

**Files:**
- Modify: `workers/newsletter/src/routes/campaign-send.ts`

**Step 1: Update import and usage**

Change import:

```typescript
import { renderEmailAsync } from '../lib/templates';
```

Find where email HTML is generated and replace `renderEmail` with `renderEmailAsync`:

```typescript
const html = await renderEmailAsync({
  templateId: campaign.template_id || 'simple',
  content: campaign.content,
  subject: campaign.subject,
  brandSettings,
  subscriber: { name: sub.name, email: sub.email },
  unsubscribeUrl,
  siteUrl: env.SITE_URL,
  shortenUrls: true,
  campaignId: campaign.id,
  env,
});
```

**Step 2: Commit**

```
git add src/routes/campaign-send.ts
git commit -m "feat: enable URL shortening for campaign emails (#132)"
```

---

## Task 8: Update Sequence Processor to Use URL Shortening

**Files:**
- Modify: `workers/newsletter/src/lib/sequence-processor.ts`

**Step 1: Update import and usage**

Change import:

```typescript
import { renderEmailAsync } from './templates';
```

Find where email HTML is generated and replace with:

```typescript
const html = await renderEmailAsync({
  templateId: step.template_id || 'simple',
  content: step.content,
  subject: step.subject,
  brandSettings,
  subscriber: { name: subscriber.name, email: subscriber.email },
  unsubscribeUrl,
  siteUrl: env.SITE_URL,
  shortenUrls: true,
  sequenceStepId: step.id,
  env,
});
```

**Step 2: Commit**

```
git add src/lib/sequence-processor.ts
git commit -m "feat: enable URL shortening for sequence emails (#132)"
```

---

## Task 9: Apply Schema to Production and Deploy

**Step 1: Apply schema to production**

Run: `npx wrangler d1 execute edgeshift-newsletter --remote --file=./schema.sql`
Expected: Success

**Step 2: Verify table exists**

Run: `npx wrangler d1 execute edgeshift-newsletter --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='short_urls'"`
Expected: `short_urls` in output

**Step 3: Deploy worker**

Run: `npm run deploy`
Expected: Deployed successfully

---

## Task 10: Manual Testing and PR

**Step 1: Test redirect endpoint**

Insert test data:
```
npx wrangler d1 execute edgeshift-newsletter --remote --command="INSERT INTO short_urls (id, short_code, original_url, position, created_at) VALUES ('manual-test', 'testXYZ1', 'https://zenn.dev', 1, unixepoch())"
```

Test redirect:
```
curl -I https://edgeshift.tech/r/testXYZ1
```
Expected: 302 redirect to https://zenn.dev

Clean up:
```
npx wrangler d1 execute edgeshift-newsletter --remote --command="DELETE FROM short_urls WHERE id = 'manual-test'"
```

**Step 2: Push and create PR**

```
git push origin feature/url-shortener
gh pr create --title "feat: URL shortening for Gmail spam prevention (#132)" --body "## Summary
- Add short_urls table for tracking shortened URLs
- Implement URL shortener library with position tracking
- Add /r/:code redirect endpoint
- Enable URL shortening for campaigns and sequences

## Test Plan
- [x] Unit tests for URL shortener
- [x] Unit tests for redirect handler
- [ ] Manual test: send campaign with external URLs
- [ ] Verify short URLs redirect correctly

Closes #132"
```
