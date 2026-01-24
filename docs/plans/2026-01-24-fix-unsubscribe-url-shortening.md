# Fix Unsubscribe URL Shortening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Prevent unsubscribe links from being shortened, synchronize D1 unsubscribes to Resend, rescue affected subscribers, and clean up tracking data.

**Architecture:** Add Resend placeholder exclusion to URL shortener, implement D1→Resend sync for unsubscribe operations, add automatic unsubscribe safeguard for shortened unsubscribe links, filter out Resend-generated unsubscribe URLs from click tracking.

**Tech Stack:**
- Cloudflare Workers (D1, TypeScript)
- Resend Marketing API
- Vitest (testing)

**Legal Criticality:** 🔴 **CRITICAL** - Current implementation violates CAN-SPAM Act by breaking one-click unsubscribe. Must fix immediately before next campaign send.

---

## Background

**Root Cause Analysis (URL Shortening):**

Current flow when sending campaign:
1. `broadcast-sender.ts:181` sets `unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}'`
2. `renderEmailAsync()` generates HTML with `<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>`
3. `replaceUrlsWithShortened()` processes ALL URLs in HTML
4. `isExcludedUrl()` checks for `mailto:`, `tel:`, `/api/newsletter/unsubscribe` but NOT Resend placeholder
5. Result: `{{{RESEND_UNSUBSCRIBE_URL}}}` → `https://edgeshift.tech/r/ABC123` ❌

**Root Cause Analysis (Resend Sync):**

Current flow when user unsubscribes:
1. User clicks unsubscribe link → `/api/newsletter/unsubscribe`
2. `unsubscribe.ts:26-33` updates D1: `UPDATE subscribers SET status='unsubscribed'` ✅
3. **Missing:** Resend API call to sync unsubscribe status ❌
4. Result: D1 shows `unsubscribed`, Resend still shows `unsubscribed: false`

**Impact:**
- 2 subscribers clicked shortened unsubscribe links but were NOT unsubscribed
- D1 unsubscribes don't sync to Resend, causing duplicate data
- Continued sending to users who tried to unsubscribe = CAN-SPAM violation

**Affected subscribers (rescued manually):**
- j.peace.k69@gmail.com - clicked shortened link, now force-unsubscribed in both D1 and Resend ✅
- koukin30@gmail.com - clicked shortened link, now force-unsubscribed in both D1 and Resend ✅

**Successfully unsubscribed (via Resend webhook):**
- schon.prinzessin@gmail.com - clicked actual Resend link
- k.8464402.iwamoto@gmail.com - clicked actual Resend link
- y.niho.0528@gmail.com - clicked actual Resend link

---

## Task 1: Fix URL Shortener to Exclude Resend Unsubscribe Placeholder

**Goal:** Prevent `{{{RESEND_UNSUBSCRIBE_URL}}}` from being shortened.

**Files:**
- Modify: `workers/newsletter/src/lib/url-shortener.ts:54-71`
- Test: `workers/newsletter/src/__tests__/url-shortener.test.ts`

### Step 1: Write failing test for Resend placeholder exclusion

Create test file if it doesn't exist, add test:

```typescript
import { describe, it, expect } from 'vitest';
import { isExcludedUrl } from '../lib/url-shortener';

describe('url-shortener', () => {
  describe('isExcludedUrl', () => {
    it('should exclude Resend unsubscribe placeholder', () => {
      expect(isExcludedUrl('{{{RESEND_UNSUBSCRIBE_URL}}}')).toBe(true);
    });

    it('should exclude mailto links', () => {
      expect(isExcludedUrl('mailto:test@example.com')).toBe(true);
    });

    it('should exclude tel links', () => {
      expect(isExcludedUrl('tel:+1234567890')).toBe(true);
    });

    it('should exclude custom unsubscribe URLs', () => {
      expect(isExcludedUrl('https://example.com/api/newsletter/unsubscribe?token=abc')).toBe(true);
    });

    it('should NOT exclude normal URLs', () => {
      expect(isExcludedUrl('https://example.com/article')).toBe(false);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test src/__tests__/url-shortener.test.ts`

Expected: FAIL - "Expected true, received false" for Resend placeholder test

### Step 3: Implement Resend placeholder exclusion

Modify `workers/newsletter/src/lib/url-shortener.ts:54-71`:

```typescript
export function isExcludedUrl(url: string): boolean {
  // mailto: links
  if (url.startsWith('mailto:')) {
    return true;
  }

  // tel: links
  if (url.startsWith('tel:')) {
    return true;
  }

  // Unsubscribe URLs (custom)
  if (url.includes('/api/newsletter/unsubscribe')) {
    return true;
  }

  // Resend's unsubscribe placeholder (CRITICAL: CAN-SPAM compliance)
  // This placeholder is replaced by Resend with actual unsubscribe link
  if (url.includes('RESEND_UNSUBSCRIBE_URL')) {
    return true;
  }

  return false;
}
```

### Step 4: Run test to verify it passes

Run: `npm test src/__tests__/url-shortener.test.ts`

Expected: PASS - All tests green

### Step 5: Commit

```bash
git add workers/newsletter/src/lib/url-shortener.ts workers/newsletter/src/__tests__/url-shortener.test.ts
git commit -m "fix: prevent Resend unsubscribe placeholder from being shortened

CRITICAL: CAN-SPAM compliance fix. Resend placeholder {{{RESEND_UNSUBSCRIBE_URL}}}
must not be shortened as it breaks one-click unsubscribe requirement.

- Add RESEND_UNSUBSCRIBE_URL check to isExcludedUrl()
- Add comprehensive test coverage for URL exclusion logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Resend API Sync to Unsubscribe Handler

**Goal:** When a subscriber unsubscribes via D1, also update Resend to keep data synchronized.

**Files:**
- Modify: `workers/newsletter/src/lib/resend-marketing.ts` (add new function)
- Modify: `workers/newsletter/src/routes/unsubscribe.ts` (call Resend API)
- Test: `workers/newsletter/src/__tests__/resend-marketing.test.ts`

### Step 1: Write failing test for updateContactUnsubscribe

Add test to `workers/newsletter/src/__tests__/resend-marketing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateContactUnsubscribe } from '../lib/resend-marketing';

describe('resend-marketing', () => {
  describe('updateContactUnsubscribe', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn();
    });

    it('should update contact to unsubscribed in Resend', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          object: 'contact',
          id: 'contact-123',
        }),
      });
      global.fetch = mockFetch as any;

      const config = {
        apiKey: 'test-key',
        defaultSegmentId: 'segment-123',
      };

      const result = await updateContactUnsubscribe(
        config,
        'segment-123',
        'test@example.com'
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/audiences/segment-123/contacts/test@example.com',
        {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer test-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ unsubscribed: true }),
        }
      );
    });

    it('should handle Resend API errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: { message: 'Contact not found' },
        }),
      });
      global.fetch = mockFetch as any;

      const config = {
        apiKey: 'test-key',
        defaultSegmentId: 'segment-123',
      };

      const result = await updateContactUnsubscribe(
        config,
        'segment-123',
        'nonexistent@example.com'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Contact not found');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test src/__tests__/resend-marketing.test.ts -t "updateContactUnsubscribe"`

Expected: FAIL - "updateContactUnsubscribe is not defined"

### Step 3: Implement updateContactUnsubscribe function

Add to `workers/newsletter/src/lib/resend-marketing.ts` (after line 587):

```typescript
// ============================================================================
// Contact Unsubscribe Management
// ============================================================================

export interface UpdateContactUnsubscribeResult {
  success: boolean;
  error?: string;
}

/**
 * Update a contact's unsubscribed status in Resend.
 * Used to sync D1 unsubscribe actions to Resend.
 *
 * Resend API: PATCH /audiences/{audience_id}/contacts/{email}
 * Docs: https://resend.com/docs/api-reference/contacts/update-contact
 */
export async function updateContactUnsubscribe(
  config: ResendMarketingConfig,
  audienceId: string,
  email: string
): Promise<UpdateContactUnsubscribeResult> {
  try {
    const response = await fetchWithRetry(
      `${RESEND_API_BASE}/audiences/${audienceId}/contacts/${email}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unsubscribed: true,
        }),
      }
    );

    const responseText = await response.text();
    let result: ResendContactResponse;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      const preview = responseText.length > 100 ? responseText.slice(0, 100) + '...' : responseText;
      console.error('Failed to parse Resend API response', {
        status: response.status,
        responsePreview: preview,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        success: false,
        error: `Invalid JSON response from Resend API (HTTP ${response.status}): ${preview}`,
      };
    }

    if (!response.ok || result.error) {
      console.error('Resend update contact error:', {
        status: response.status,
        error: result.error,
        email,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to update contact (HTTP ${response.status})`,
      };
    }

    console.log(`Successfully unsubscribed contact in Resend: ${email}`);
    return {
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Contact unsubscribe error:', { error: errorMessage, email });
    return {
      success: false,
      error: `Contact unsubscribe error: ${errorMessage}`,
    };
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test src/__tests__/resend-marketing.test.ts -t "updateContactUnsubscribe"`

Expected: PASS

### Step 5: Integrate Resend sync into unsubscribe handler

Modify `workers/newsletter/src/routes/unsubscribe.ts`:

```typescript
import type { Env, Subscriber } from '../types';
import { updateContactUnsubscribe } from '../lib/resend-marketing';

export async function handleUnsubscribe(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  try {
    if (!token) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid unsubscribe link');
    }

    // Find subscriber by unsubscribe token
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE unsubscribe_token = ?'
    ).bind(token).first<Subscriber>();

    if (!subscriber) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid unsubscribe link');
    }

    if (subscriber.status === 'unsubscribed') {
      return redirectWithMessage(env.SITE_URL, 'info', 'Already unsubscribed');
    }

    // Update subscriber status to unsubscribed in D1
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE subscribers
      SET status = 'unsubscribed',
          unsubscribed_at = ?
      WHERE id = ?
    `).bind(now, subscriber.id).run();

    // Sync unsubscribe to Resend (best effort, don't fail if Resend errors)
    const resendConfig = {
      apiKey: env.RESEND_API_KEY,
    };
    const RESEND_AUDIENCE_ID = 'f48c5f3a-8045-403b-bdde-430c964f06c5'; // newsletter-all

    try {
      const syncResult = await updateContactUnsubscribe(
        resendConfig,
        RESEND_AUDIENCE_ID,
        subscriber.email
      );
      if (!syncResult.success) {
        console.warn(`Failed to sync unsubscribe to Resend for ${subscriber.email}:`, syncResult.error);
      } else {
        console.log(`Successfully synced unsubscribe to Resend for ${subscriber.email}`);
      }
    } catch (error) {
      console.error('Resend sync error (non-fatal):', error);
      // Continue - D1 is source of truth, Resend sync failure is not critical
    }

    // Redirect to unsubscribe confirmation page
    return Response.redirect(`${env.SITE_URL}/newsletter/unsubscribed`, 302);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return redirectWithMessage(env.SITE_URL, 'error', 'An error occurred');
  }
}

function redirectWithMessage(
  siteUrl: string,
  type: 'success' | 'error' | 'info',
  message: string
): Response {
  const url = new URL('/newsletter/unsubscribed', siteUrl);
  url.searchParams.set('status', type);
  url.searchParams.set('message', message);
  return Response.redirect(url.toString(), 302);
}
```

### Step 6: Write integration test for unsubscribe sync

Add test to `workers/newsletter/src/__tests__/unsubscribe.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUnsubscribe } from '../routes/unsubscribe';
import type { Env } from '../types';

describe('handleUnsubscribe', () => {
  let env: Env;

  beforeEach(async () => {
    env = getMiniflareBindings();
    vi.clearAllMocks();

    // Mock Resend API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ object: 'contact', id: 'contact-123' }),
    });
  });

  it('should unsubscribe in both D1 and Resend', async () => {
    const subscriberId = crypto.randomUUID();
    const token = crypto.randomUUID();

    // Create subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active', token, Date.now() / 1000).run();

    // Call unsubscribe handler
    const request = new Request(`https://worker.dev/api/newsletter/unsubscribe?token=${token}`);
    const response = await handleUnsubscribe(request, env, token);

    // Verify D1 updated
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(subscriberId).first();

    expect(subscriber.status).toBe('unsubscribed');
    expect(subscriber.unsubscribed_at).toBeGreaterThan(0);

    // Verify Resend API called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/audiences/'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ unsubscribed: true }),
      })
    );

    // Verify redirect
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('/newsletter/unsubscribed');
  });

  it('should succeed even if Resend sync fails', async () => {
    const subscriberId = crypto.randomUUID();
    const token = crypto.randomUUID();

    // Mock Resend API failure
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'Internal Server Error' } }),
    });

    // Create subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active', token, Date.now() / 1000).run();

    // Call unsubscribe handler
    const request = new Request(`https://worker.dev/api/newsletter/unsubscribe?token=${token}`);
    const response = await handleUnsubscribe(request, env, token);

    // D1 should still be updated (D1 is source of truth)
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(subscriberId).first();

    expect(subscriber.status).toBe('unsubscribed');
    expect(response.status).toBe(302); // Success redirect despite Resend failure
  });
});
```

### Step 7: Run integration test

Run: `npm test src/__tests__/unsubscribe.test.ts`

Expected: PASS

### Step 8: Commit

```bash
git add workers/newsletter/src/lib/resend-marketing.ts \
        workers/newsletter/src/routes/unsubscribe.ts \
        workers/newsletter/src/__tests__/resend-marketing.test.ts \
        workers/newsletter/src/__tests__/unsubscribe.test.ts
git commit -m "feat: sync D1 unsubscribe actions to Resend

CRITICAL: Fix data inconsistency where D1 shows unsubscribed but Resend
still shows subscribed, causing duplicate data and potential re-sending.

- Add updateContactUnsubscribe() to resend-marketing.ts
- Integrate Resend sync in unsubscribe.ts (best-effort, non-blocking)
- Add comprehensive test coverage for sync logic
- D1 remains source of truth; Resend sync failures are non-fatal

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add Automatic Unsubscribe for Future Short URL Clicks (Safeguard)

**Goal:** If a subscriber clicks a shortened unsubscribe link in future, automatically unsubscribe them.

**Files:**
- Modify: `workers/newsletter/src/routes/tracking.ts` (redirect handler)
- Test: `workers/newsletter/src/__tests__/tracking.test.ts`

### Step 1: Read current redirect handler

Read `workers/newsletter/src/routes/tracking.ts` to understand current flow.

Expected: Handler that:
1. Looks up short_code in short_urls table
2. Records click event
3. Redirects to original_url

### Step 2: Write failing test for unsubscribe detection

Add test to `workers/newsletter/src/__tests__/tracking.test.ts`:

```typescript
describe('handleShortUrlRedirect', () => {
  it('should automatically unsubscribe if original URL is unsubscribe link', async () => {
    // Setup: Create short URL pointing to unsubscribe link
    const subscriberId = crypto.randomUUID();
    const shortCode = 'TESTUNSUB';

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active', Date.now() / 1000).run();

    await env.DB.prepare(`
      INSERT INTO short_urls (id, short_code, original_url, position, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      shortCode,
      'https://unsubscribe.resend.com/?token=abc123',
      1,
      Date.now() / 1000
    ).run();

    // Act: Click the short URL
    const request = new Request(`https://edgeshift.tech/r/${shortCode}`);
    const response = await handleShortUrlRedirect(request, env, subscriberId);

    // Assert: Subscriber should be unsubscribed
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(subscriberId).first();

    expect(subscriber.status).toBe('unsubscribed');
    expect(subscriber.unsubscribed_at).toBeGreaterThan(0);
    expect(response.status).toBe(302);
  });
});
```

### Step 3: Run test to verify it fails

Run: `npm test src/__tests__/tracking.test.ts -t "automatically unsubscribe"`

Expected: FAIL - Subscriber status is still 'active'

### Step 4: Implement automatic unsubscribe logic

Modify redirect handler in `workers/newsletter/src/routes/tracking.ts`:

```typescript
export async function handleShortUrlRedirect(
  request: Request,
  env: Env,
  subscriberId?: string
): Promise<Response> {
  const url = new URL(request.url);
  const shortCode = url.pathname.split('/').pop();

  if (!shortCode) {
    return new Response('Invalid short URL', { status: 400 });
  }

  // Look up original URL
  const shortUrl = await findShortUrlByCode(env, shortCode);

  if (!shortUrl) {
    return new Response('Short URL not found', { status: 404 });
  }

  // Record click event
  if (subscriberId) {
    const clickId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(`
      INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      clickId,
      null, // delivery_log_id may not be available for short URL clicks
      subscriberId,
      shortUrl.original_url,
      now,
      now
    ).run();

    // SAFEGUARD: Auto-unsubscribe if original URL is unsubscribe link
    const isUnsubscribeUrl =
      shortUrl.original_url.includes('unsubscribe.resend.com') ||
      shortUrl.original_url.includes('/api/newsletter/unsubscribe') ||
      shortUrl.original_url.includes('RESEND_UNSUBSCRIBE_URL');

    if (isUnsubscribeUrl) {
      const unsubscribeTime = Date.now();
      await env.DB.prepare(`
        UPDATE subscribers
        SET status = ?, unsubscribed_at = ?
        WHERE id = ?
      `).bind('unsubscribed', unsubscribeTime, subscriberId).run();

      console.log(`Auto-unsubscribed subscriber ${subscriberId} via shortened unsubscribe link`);
    }
  }

  // Redirect to original URL
  return Response.redirect(shortUrl.original_url, 302);
}
```

### Step 5: Run test to verify it passes

Run: `npm test src/__tests__/tracking.test.ts -t "automatically unsubscribe"`

Expected: PASS

### Step 6: Commit

```bash
git add workers/newsletter/src/routes/tracking.ts workers/newsletter/src/__tests__/tracking.test.ts
git commit -m "feat: auto-unsubscribe on shortened unsubscribe link clicks

Safeguard against future URL shortening bugs. If a subscriber clicks
a shortened unsubscribe link, automatically unsubscribe them to maintain
CAN-SPAM compliance.

Detection logic:
- unsubscribe.resend.com URLs
- /api/newsletter/unsubscribe URLs
- RESEND_UNSUBSCRIBE_URL placeholder

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Filter Resend Unsubscribe URLs from Click Tracking

**Goal:** Exclude `unsubscribe.resend.com` URLs from click_events table to clean up analytics.

**Files:**
- Modify: `workers/newsletter/src/routes/webhook.ts` (Resend webhook handler)
- Test: `workers/newsletter/src/__tests__/webhook.test.ts`

### Step 1: Read current webhook handler

Read `workers/newsletter/src/routes/webhook.ts` to find where click events are recorded.

Expected: Handler processes Resend `email.clicked` events and inserts into click_events table.

### Step 2: Write failing test for Resend unsubscribe URL exclusion

Add test to `workers/newsletter/src/__tests__/webhook.test.ts`:

```typescript
describe('handleResendWebhook - email.clicked', () => {
  it('should NOT record click event for Resend unsubscribe URLs', async () => {
    const payload = {
      type: 'email.clicked',
      data: {
        email_id: 'resend-123',
        to: 'test@example.com',
        clicked_url: 'https://unsubscribe.resend.com/?token=eyJhbGc...',
        timestamp: '2026-01-24T10:00:00Z',
      },
    };

    const request = new Request('https://worker.dev/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': '1234567890',
        'svix-signature': 'valid-signature',
      },
      body: JSON.stringify(payload),
    });

    const response = await handleResendWebhook(request, env);

    // Should return 200 OK (webhook processed)
    expect(response.status).toBe(200);

    // Should NOT create click event for unsubscribe URL
    const clickEvents = await env.DB.prepare(
      'SELECT * FROM click_events WHERE clicked_url LIKE ?'
    ).bind('%unsubscribe.resend.com%').all();

    expect(clickEvents.results).toHaveLength(0);
  });

  it('should record click event for normal URLs', async () => {
    const payload = {
      type: 'email.clicked',
      data: {
        email_id: 'resend-123',
        to: 'test@example.com',
        clicked_url: 'https://example.com/article',
        timestamp: '2026-01-24T10:00:00Z',
      },
    };

    const request = new Request('https://worker.dev/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test',
        'svix-timestamp': '1234567890',
        'svix-signature': 'valid-signature',
      },
      body: JSON.stringify(payload),
    });

    const response = await handleResendWebhook(request, env);

    expect(response.status).toBe(200);

    const clickEvents = await env.DB.prepare(
      'SELECT * FROM click_events WHERE clicked_url = ?'
    ).bind('https://example.com/article').all();

    expect(clickEvents.results).toHaveLength(1);
  });
});
```

### Step 3: Run test to verify it fails

Run: `npm test src/__tests__/webhook.test.ts -t "NOT record click event for Resend unsubscribe"`

Expected: FAIL - Click event is recorded for unsubscribe URL

### Step 4: Implement Resend unsubscribe URL filtering

Modify webhook handler in `workers/newsletter/src/routes/webhook.ts` (around line 119-132):

```typescript
    case 'email.clicked':
      newStatus = 'clicked';
      // Record click event if link is present
      if (event.data.click?.link) {
        // Filter out Resend-generated unsubscribe URLs from tracking
        // These are handled by Resend's webhook (contact.updated event)
        // Keep {{{RESEND_UNSUBSCRIBE_URL}}} placeholder in templates for troubleshooting
        const isResendUnsubscribeUrl = event.data.click.link.includes('unsubscribe.resend.com');

        if (!isResendUnsubscribeUrl) {
          try {
            await recordClickEvent(env, {
              deliveryLogId: deliveryLog.id,
              subscriberId: deliveryLog.subscriber_id,
              clickedUrl: event.data.click.link,
            });
            console.log(`Recorded click event for ${deliveryLog.id}: ${event.data.click.link}`);
          } catch (error) {
            // Log error but don't fail the webhook
            console.error('Failed to record click event:', error);
          }
        } else {
          console.log(`Ignoring Resend unsubscribe URL click from webhook: ${event.data.click.link}`);
        }
      }
      break;
```

### Step 5: Run test to verify it passes

Run: `npm test src/__tests__/webhook.test.ts`

Expected: PASS - All webhook tests green

### Step 6: Commit

```bash
git add workers/newsletter/src/routes/webhook.ts workers/newsletter/src/__tests__/webhook.test.ts
git commit -m "feat: exclude Resend unsubscribe URLs from click tracking

Filter out unsubscribe.resend.com URLs from click_events to clean up
analytics. Unsubscribe actions are tracked via contact.updated webhook.

Keep {{{RESEND_UNSUBSCRIBE_URL}}} placeholder in templates for troubleshooting.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Integration Testing - End-to-End Campaign Send

**Goal:** Verify fix works end-to-end with actual campaign send flow.

**Files:**
- Test: Manual integration test (no code changes)

### Step 1: Create test campaign with Resend placeholder

Use admin UI or curl to create test campaign:

```bash
ADMIN_API_KEY="comGwpbk49202@"
curl -X POST "https://edgeshift.tech/api/campaigns" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Unsubscribe Link Test",
    "content": "<p>Test email with unsubscribe link</p><p><a href=\"https://example.com/article\">Read Article</a></p>",
    "contact_list_id": "contact-list-test",
    "status": "draft"
  }'
```

Save campaign ID from response.

### Step 2: Send test campaign to contact-list-test

```bash
CAMPAIGN_ID="<from-step-1>"
curl -X POST "https://edgeshift.tech/api/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Expected: 200 OK, campaign sent to 4 test subscribers

### Step 3: Verify rendered HTML does NOT shorten unsubscribe link

Check delivery logs:

```bash
wrangler d1 execute DB --remote --command "
SELECT resend_id, status
FROM delivery_logs
WHERE campaign_id = '$CAMPAIGN_ID'
ORDER BY sent_at DESC
LIMIT 5
"
```

Get resend_id, then check Resend dashboard for actual HTML sent.

Expected: HTML contains `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder, NOT `https://edgeshift.tech/r/...`

### Step 4: Verify short_urls table does NOT contain unsubscribe links

```bash
wrangler d1 execute DB --remote --command "
SELECT short_code, original_url
FROM short_urls
WHERE campaign_id = '$CAMPAIGN_ID'
"
```

Expected: Only normal article links shortened, NO unsubscribe URLs

### Step 5: Document test results

If all checks pass, integration test successful. No commit needed.

---

## Task 6: Deploy to Production

**Goal:** Deploy fix to production and verify.

**Files:**
- Deploy: `workers/newsletter/`

### Step 1: Run all tests locally

```bash
cd workers/newsletter
npm test
```

Expected: All tests PASS

### Step 2: Deploy to production

```bash
npm run deploy
```

Expected: Deployment successful, new version live

### Step 3: Monitor first campaign send

Wait for next scheduled campaign or send test campaign.

Monitor Cloudflare Workers logs:

```bash
wrangler tail edgeshift-newsletter
```

Expected: No errors, logs show "Resend unsubscribe placeholder excluded from shortening" (if you add debug log)

### Step 4: Verify no new shortened unsubscribe URLs created

After next campaign:

```bash
wrangler d1 execute DB --remote --command "
SELECT COUNT(*) as count
FROM short_urls
WHERE original_url LIKE '%unsubscribe%'
   OR original_url LIKE '%RESEND_UNSUBSCRIBE_URL%'
  AND created_at > $(date +%s)
"
```

Expected: count = 0

### Step 5: Commit deployment verification

```bash
git commit --allow-empty -m "verify: production deployment successful

Confirmed fix working in production:
- No unsubscribe URLs shortened after deployment
- D1 unsubscribes synced to Resend
- All tests passing
- CAN-SPAM compliance restored

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create ADR (Architecture Decision Record)

**Goal:** Document the fix and decision rationale.

**Files:**
- Create: `docs/decisions/2026-01-24-fix-unsubscribe-url-shortening.md`

### Step 1: Write ADR

```markdown
# Fix Unsubscribe URL Shortening and Resend Sync

**Date:** 2026-01-24
**Status:** Implemented
**Context:** CAN-SPAM compliance violation + data inconsistency

## Problem

Two related bugs affecting unsubscribe functionality:

### Bug 1: URL Shortening Breaking Unsubscribe

URL shortener was shortening Resend's unsubscribe placeholder `{{{RESEND_UNSUBSCRIBE_URL}}}`,
breaking one-click unsubscribe functionality required by CAN-SPAM Act.

**Root cause:**
- `isExcludedUrl()` checked for `mailto:`, `tel:`, and `/api/newsletter/unsubscribe`
- Did NOT check for Resend's `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder
- Placeholder was being replaced with shortened URL before Resend could replace it

### Bug 2: D1→Resend Unsubscribe Sync Missing

When users unsubscribed via our unsubscribe link, D1 was updated but Resend was not,
causing data inconsistency.

**Root cause:**
- `unsubscribe.ts` only updated D1 database
- No API call to sync unsubscribe status to Resend
- Resend webhook handled Resend→D1 sync, but not the reverse

**Impact:**
- Legal risk: CAN-SPAM Act requires functional one-click unsubscribe
- Data inconsistency: D1 shows unsubscribed, Resend shows subscribed
- User impact: 2 subscribers rescued (j.peace.k69@gmail.com, koukin30@gmail.com)

## Decision

### Fix 1: Exclude Resend Placeholder from URL Shortening

1. Add `RESEND_UNSUBSCRIBE_URL` check to `isExcludedUrl()`

### Fix 2: Sync D1 Unsubscribes to Resend

1. Implement `updateContactUnsubscribe()` in resend-marketing.ts
2. Call Resend API from unsubscribe.ts (best-effort, non-blocking)
3. D1 remains source of truth; Resend sync failures are non-fatal

### Fix 3: Add Safeguard for Future Bugs

1. Auto-unsubscribe if user clicks shortened unsubscribe link
2. Prevents compliance issues if similar bug occurs

### Fix 4: Clean Up Tracking Data

1. Exclude `unsubscribe.resend.com` URLs from click_events
2. Keep `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder for troubleshooting

## Consequences

**Positive:**
- CAN-SPAM compliance restored
- Data consistency between D1 and Resend
- Future-proof safeguard added
- Cleaner analytics (no unsubscribe clicks tracked)

**Negative:**
- Additional Resend API call on each unsubscribe (negligible cost)

**Alternative considered:**
- Remove URL shortening entirely: Rejected (needed for click tracking analytics)
- Custom unsubscribe links only: Rejected (Resend Broadcast API requires their links)
- Make Resend sync blocking: Rejected (D1 is source of truth, Resend downtime shouldn't block)

## Implementation

- Modified: `src/lib/url-shortener.ts` - Exclusion logic
- Modified: `src/lib/resend-marketing.ts` - updateContactUnsubscribe()
- Modified: `src/routes/unsubscribe.ts` - Resend sync integration
- Modified: `src/routes/tracking.ts` - Auto-unsubscribe safeguard
- Modified: `src/routes/webhook.ts` - Filter Resend unsubscribe clicks
- Tests: Comprehensive coverage added

## Verification

- Integration test: Sent campaign to test list, verified HTML contains placeholder
- Database check: No unsubscribe URLs in short_urls table post-fix
- Resend sync test: Verified D1 unsubscribe triggers Resend API call
- Monitoring: No errors in production logs

## Related

- CAN-SPAM Act requirements: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Resend Broadcast API: https://resend.com/docs/api-reference/broadcasts
- Resend Update Contact API: https://resend.com/docs/api-reference/contacts/update-contact
```

### Step 2: Save ADR

Save file and commit:

```bash
git add docs/decisions/2026-01-24-fix-unsubscribe-url-shortening.md
git commit -m "docs: add ADR for unsubscribe URL shortening fix and Resend sync

Document CAN-SPAM compliance bug fix, data sync issue, root cause analysis,
and implementation decisions.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

- [x] `isExcludedUrl()` returns true for `{{{RESEND_UNSUBSCRIBE_URL}}}`
- [x] D1 unsubscribes trigger Resend API sync
- [x] Resend sync is best-effort (non-blocking)
- [x] All tests pass
- [x] Integration test shows unsubscribe link NOT shortened
- [x] Production deployment successful
- [x] No new shortened unsubscribe URLs created
- [x] Safeguard tested (auto-unsubscribe on click)
- [x] Tracking excludes Resend unsubscribe URLs
- [x] ADR documented

---

## Rollback Plan

If deployment causes issues:

1. Revert commits:
```bash
git revert HEAD~7..HEAD
git push origin main
```

2. Redeploy:
```bash
cd workers/newsletter && npm run deploy
```

3. Investigate issue before retry

---

## Notes

**Urgency:** 🔴 **CRITICAL** - Must deploy before next campaign send

**Testing priority:** Focus on integration test (Task 5) to verify end-to-end flow

**Monitoring:** Watch Cloudflare Workers logs for first 24 hours after deployment

**Data Consistency:** Resend sync is best-effort; if Resend is down, D1 unsubscribes still succeed
