# Resend Marketing API Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate newsletter system from Resend Transactional API (Email API) to Marketing API (Broadcast API) for contact-based pricing.

**Architecture:** D1 is master data, Resend Contacts are send-only cache. Lazy sync on-send. Temp Segments per broadcast. Self-hosted unsubscribe for SES migration readiness.

**Tech Stack:** Cloudflare Workers, D1, Resend Broadcast API, TypeScript, Vitest

---

## Phase 1: Infrastructure (Tasks 1-4)

### Task 1: Add resend_contact_id column to D1 schema

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Modify: `workers/newsletter/src/__tests__/setup.ts`

**Step 1.1: Update schema.sql**

Add the new column and index to the subscribers table:

```sql
-- Add to subscribers table (after referral_count line)
-- Resend Marketing API integration
resend_contact_id TEXT,
```

Add the index after existing subscriber indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_subscribers_resend_contact_id ON subscribers(resend_contact_id);
```

**Step 1.2: Update test setup.ts**

Add `resend_contact_id TEXT` to the subscribers table in `setupTestDb()`:

```typescript
env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending',
  confirm_token TEXT,
  unsubscribe_token TEXT,
  signup_page_slug TEXT,
  subscribed_at INTEGER,
  unsubscribed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  referral_count INTEGER DEFAULT 0,
  resend_contact_id TEXT
)`),
```

**Step 1.3: Verify**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/subscribers.test.ts
```

Expected output: All tests pass.

**Step 1.4: Commit**

```bash
git add schema.sql src/__tests__/setup.ts
git commit -m "feat(schema): add resend_contact_id column for Marketing API integration

Adds resend_contact_id to subscribers table to cache Resend Contact IDs
for lazy sync on-send pattern. Includes index for efficient lookup.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Create Resend Marketing service types

**Files:**
- Create: `workers/newsletter/src/lib/resend-marketing.ts`
- Modify: `workers/newsletter/src/types.ts`

**Step 2.1: Add types to types.ts**

Add the following interfaces after the existing types:

```typescript
// Resend Marketing API types
export interface ResendContact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  unsubscribed: boolean;
}

export interface ResendSegment {
  id: string;
  name: string;
  created_at: string;
}

export interface ResendBroadcast {
  id: string;
  name: string;
  audience_id: string;
  from: string;
  subject: string;
  reply_to?: string;
  preview_text?: string;
  status: 'draft' | 'queued' | 'sending' | 'sent';
  created_at: string;
  scheduled_at?: string;
  sent_at?: string;
}

export interface ResendAudience {
  id: string;
  name: string;
  created_at: string;
}
```

**Step 2.2: Create resend-marketing.ts**

```typescript
import type { Env, Subscriber } from '../types';

const RESEND_API_BASE = 'https://api.resend.com';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Don't retry on client errors (4xx), only on server errors (5xx)
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Exponential backoff
    if (attempt < maxRetries - 1) {
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Split full name into firstName and lastName
 * - "Taro Yamada" -> ["Taro", "Yamada"]
 * - "Taro" -> ["Taro", ""]
 * - null/undefined -> ["", ""]
 */
export function splitName(name: string | null | undefined): [string, string] {
  if (!name) return ['', ''];
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

export interface ResendMarketingConfig {
  apiKey: string;
  audienceId: string;
}

export interface CreateContactResult {
  success: boolean;
  contactId?: string;
  error?: string;
}

export interface CreateSegmentResult {
  success: boolean;
  segmentId?: string;
  error?: string;
}

export interface CreateBroadcastResult {
  success: boolean;
  broadcastId?: string;
  error?: string;
}

/**
 * Ensure a Resend Contact exists for the subscriber.
 * Uses lazy sync: only creates contact on first send.
 * Returns the contact ID (from cache or newly created).
 */
export async function ensureResendContact(
  subscriber: Subscriber & { resend_contact_id?: string | null },
  config: ResendMarketingConfig,
  env: Env
): Promise<CreateContactResult> {
  // 1. Return cached contact ID if available
  if (subscriber.resend_contact_id) {
    return { success: true, contactId: subscriber.resend_contact_id };
  }

  // 2. Create new contact in Resend
  const [firstName, lastName] = splitName(subscriber.name);

  try {
    const response = await fetchWithRetry(
      `${RESEND_API_BASE}/audiences/${config.audienceId}/contacts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: subscriber.email,
          first_name: firstName,
          last_name: lastName,
          unsubscribed: false,
        }),
      }
    );

    const result = await response.json() as { id?: string; object?: string; error?: { message: string } };

    if (!response.ok || result.error) {
      console.error('Failed to create Resend contact:', {
        email: subscriber.email,
        status: response.status,
        error: result.error,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to create contact (HTTP ${response.status})`,
      };
    }

    const contactId = result.id;
    if (!contactId) {
      return { success: false, error: 'No contact ID returned from Resend' };
    }

    // 3. Cache contact ID in D1
    await env.DB.prepare(
      'UPDATE subscribers SET resend_contact_id = ? WHERE id = ?'
    ).bind(contactId, subscriber.id).run();

    return { success: true, contactId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating Resend contact:', {
      email: subscriber.email,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Create a temporary segment for broadcast targeting.
 * Segment name includes timestamp for uniqueness.
 */
export async function createTempSegment(
  name: string,
  config: ResendMarketingConfig
): Promise<CreateSegmentResult> {
  const segmentName = `${name}-${Date.now()}`;

  try {
    const response = await fetchWithRetry(
      `${RESEND_API_BASE}/audiences/${config.audienceId}/segments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: segmentName }),
      }
    );

    const result = await response.json() as { id?: string; error?: { message: string } };

    if (!response.ok || result.error) {
      return {
        success: false,
        error: result.error?.message || `Failed to create segment (HTTP ${response.status})`,
      };
    }

    return { success: true, segmentId: result.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Add contacts to a segment.
 */
export async function addContactsToSegment(
  segmentId: string,
  contactIds: string[],
  config: ResendMarketingConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Resend API expects contacts to be added one at a time or in batch
    // Using batch approach for efficiency
    const response = await fetchWithRetry(
      `${RESEND_API_BASE}/audiences/${config.audienceId}/segments/${segmentId}/contacts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contact_ids: contactIds }),
      }
    );

    if (!response.ok) {
      const result = await response.json() as { error?: { message: string } };
      return {
        success: false,
        error: result.error?.message || `Failed to add contacts (HTTP ${response.status})`,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a segment (cleanup after broadcast).
 */
export async function deleteSegment(
  segmentId: string,
  config: ResendMarketingConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry(
      `${RESEND_API_BASE}/audiences/${config.audienceId}/segments/${segmentId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const result = await response.json() as { error?: { message: string } };
      return {
        success: false,
        error: result.error?.message || `Failed to delete segment (HTTP ${response.status})`,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Log but don't fail - segment cleanup is best effort
    console.warn('Segment cleanup failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export interface BroadcastOptions {
  segmentId: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Create and send a broadcast to a segment.
 */
export async function createAndSendBroadcast(
  options: BroadcastOptions,
  config: ResendMarketingConfig
): Promise<CreateBroadcastResult> {
  try {
    // Create broadcast
    const createResponse = await fetchWithRetry(
      `${RESEND_API_BASE}/broadcasts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audience_id: config.audienceId,
          segment_id: options.segmentId,
          from: options.from,
          subject: options.subject,
          html: options.html,
          reply_to: options.replyTo,
        }),
      }
    );

    const createResult = await createResponse.json() as { id?: string; error?: { message: string } };

    if (!createResponse.ok || createResult.error) {
      return {
        success: false,
        error: createResult.error?.message || `Failed to create broadcast (HTTP ${createResponse.status})`,
      };
    }

    const broadcastId = createResult.id;
    if (!broadcastId) {
      return { success: false, error: 'No broadcast ID returned' };
    }

    // Send broadcast
    const sendResponse = await fetchWithRetry(
      `${RESEND_API_BASE}/broadcasts/${broadcastId}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      }
    );

    if (!sendResponse.ok) {
      const sendResult = await sendResponse.json() as { error?: { message: string } };
      return {
        success: false,
        error: sendResult.error?.message || `Failed to send broadcast (HTTP ${sendResponse.status})`,
      };
    }

    return { success: true, broadcastId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}
```

**Step 2.3: Verify TypeScript compiles**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npx tsc --noEmit
```

Expected output: No errors.

**Step 2.4: Commit**

```bash
git add src/lib/resend-marketing.ts src/types.ts
git commit -m "feat(resend-marketing): add Resend Marketing API service layer

Implements core service functions for Marketing API integration:
- ensureResendContact(): lazy sync contact creation
- createTempSegment(): temp segment for broadcast targeting
- addContactsToSegment(): batch contact addition
- deleteSegment(): cleanup after broadcast
- createAndSendBroadcast(): broadcast creation and send
- splitName(): utility to split full name

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Write tests for ensureResendContact()

**Files:**
- Create: `workers/newsletter/src/__tests__/resend-marketing.test.ts`

**Step 3.1: Create test file**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import {
  splitName,
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
} from '../lib/resend-marketing';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockConfig = {
  apiKey: 'test-api-key',
  audienceId: 'aud_test123',
};

describe('splitName', () => {
  it('should split "Taro Yamada" into ["Taro", "Yamada"]', () => {
    expect(splitName('Taro Yamada')).toEqual(['Taro', 'Yamada']);
  });

  it('should handle single name "Taro" as ["Taro", ""]', () => {
    expect(splitName('Taro')).toEqual(['Taro', '']);
  });

  it('should handle null/undefined as ["", ""]', () => {
    expect(splitName(null)).toEqual(['', '']);
    expect(splitName(undefined)).toEqual(['', '']);
  });

  it('should handle empty string as ["", ""]', () => {
    expect(splitName('')).toEqual(['', '']);
    expect(splitName('   ')).toEqual(['', '']);
  });

  it('should handle multiple spaces in name', () => {
    expect(splitName('Taro  Yamada')).toEqual(['Taro', 'Yamada']);
  });

  it('should handle three-part name', () => {
    expect(splitName('John Paul Jones')).toEqual(['John', 'Paul Jones']);
  });
});

describe('ensureResendContact', () => {
  beforeEach(async () => {
    await setupTestDb();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return cached contact ID if available', async () => {
    const env = getTestEnv();

    // Create subscriber with existing resend_contact_id
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, resend_contact_id)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'existing_contact_123')
    `).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind('sub-1').first();

    const result = await ensureResendContact(subscriber as any, mockConfig, env);

    expect(result.success).toBe(true);
    expect(result.contactId).toBe('existing_contact_123');
    // Should not call API
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should create new contact and cache ID if not exists', async () => {
    const env = getTestEnv();

    // Create subscriber without resend_contact_id
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status)
      VALUES ('sub-2', 'new@example.com', 'New User', 'active')
    `).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind('sub-2').first();

    // Mock successful contact creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new_contact_456', object: 'contact' }),
    });

    const result = await ensureResendContact(subscriber as any, mockConfig, env);

    expect(result.success).toBe(true);
    expect(result.contactId).toBe('new_contact_456');

    // Verify API was called correctly
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/audiences/aud_test123/contacts');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.email).toBe('new@example.com');
    expect(body.first_name).toBe('New');
    expect(body.last_name).toBe('User');

    // Verify contact ID was cached in D1
    const updated = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub-2').first();
    expect(updated?.resend_contact_id).toBe('new_contact_456');
  });

  it('should handle API error gracefully', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status)
      VALUES ('sub-3', 'error@example.com', 'Error User', 'active')
    `).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind('sub-3').first();

    // Mock API error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid email' } }),
    });

    const result = await ensureResendContact(subscriber as any, mockConfig, env);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid email');
  });
});

describe('createTempSegment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should create segment with timestamped name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'seg_123' }),
    });

    const result = await createTempSegment('campaign-test', mockConfig);

    expect(result.success).toBe(true);
    expect(result.segmentId).toBe('seg_123');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/audiences/aud_test123/segments');
    const body = JSON.parse(options.body);
    expect(body.name).toMatch(/^campaign-test-\d+$/);
  });

  it('should handle segment creation error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Server error' } }),
    });

    const result = await createTempSegment('campaign-test', mockConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Server error');
  });
});

describe('addContactsToSegment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should add contacts to segment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await addContactsToSegment(
      'seg_123',
      ['contact_1', 'contact_2'],
      mockConfig
    );

    expect(result.success).toBe(true);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/audiences/aud_test123/segments/seg_123/contacts');
    const body = JSON.parse(options.body);
    expect(body.contact_ids).toEqual(['contact_1', 'contact_2']);
  });
});

describe('deleteSegment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should delete segment successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await deleteSegment('seg_123', mockConfig);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/audiences/aud_test123/segments/seg_123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('should treat 404 as success (already deleted)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const result = await deleteSegment('seg_notfound', mockConfig);

    expect(result.success).toBe(true);
  });
});

describe('createAndSendBroadcast', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should create and send broadcast', async () => {
    // Mock create broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bc_123' }),
    });
    // Mock send broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await createAndSendBroadcast(
      {
        segmentId: 'seg_123',
        from: 'Test <test@example.com>',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      },
      mockConfig
    );

    expect(result.success).toBe(true);
    expect(result.broadcastId).toBe('bc_123');

    // Verify create call
    const [createUrl, createOptions] = mockFetch.mock.calls[0];
    expect(createUrl).toBe('https://api.resend.com/broadcasts');
    const createBody = JSON.parse(createOptions.body);
    expect(createBody.segment_id).toBe('seg_123');
    expect(createBody.from).toBe('Test <test@example.com>');

    // Verify send call
    const [sendUrl, sendOptions] = mockFetch.mock.calls[1];
    expect(sendUrl).toBe('https://api.resend.com/broadcasts/bc_123/send');
    expect(sendOptions.method).toBe('POST');
  });

  it('should handle broadcast creation error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid segment' } }),
    });

    const result = await createAndSendBroadcast(
      {
        segmentId: 'invalid_seg',
        from: 'Test <test@example.com>',
        subject: 'Test',
        html: '<p>Test</p>',
      },
      mockConfig
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid segment');
  });
});
```

**Step 3.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/resend-marketing.test.ts
```

Expected output: All tests pass.

**Step 3.3: Commit**

```bash
git add src/__tests__/resend-marketing.test.ts
git commit -m "test(resend-marketing): add unit tests for Marketing API service

Tests cover:
- splitName() utility function
- ensureResendContact() with cache hit and API call scenarios
- createTempSegment() with timestamp naming
- addContactsToSegment() batch operation
- deleteSegment() including 404 handling
- createAndSendBroadcast() create and send flow

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Add RESEND_AUDIENCE_ID environment variable

**Files:**
- Modify: `workers/newsletter/src/types.ts`
- Modify: `workers/newsletter/src/__tests__/setup.ts`
- Modify: `workers/newsletter/wrangler.toml`

**Step 4.1: Update Env interface in types.ts**

Add after `RESEND_WEBHOOK_SECRET`:

```typescript
RESEND_AUDIENCE_ID?: string; // Optional: Resend audience ID for Marketing API
```

**Step 4.2: Update test setup.ts**

Add to `getTestEnv()`:

```typescript
RESEND_AUDIENCE_ID: 'test-audience-id',
```

**Step 4.3: Update wrangler.toml**

Add to `[vars]` section (placeholder, will be set via secret in production):

```toml
# Resend Marketing API (set via wrangler secret put in production)
# RESEND_AUDIENCE_ID = "your-audience-id"
```

**Step 4.4: Verify**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/resend-marketing.test.ts
```

Expected output: All tests pass.

**Step 4.5: Commit**

```bash
git add src/types.ts src/__tests__/setup.ts wrangler.toml
git commit -m "feat(env): add RESEND_AUDIENCE_ID for Marketing API

Adds RESEND_AUDIENCE_ID to Env interface and test setup.
This will be set via wrangler secret put in production.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Campaign Integration (Tasks 5-8)

### Task 5: Create sendCampaignViaBroadcast() function

**Files:**
- Create: `workers/newsletter/src/lib/broadcast-sender.ts`

**Step 5.1: Create broadcast-sender.ts**

```typescript
import type { Env, Campaign, Subscriber, BrandSettings } from '../types';
import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
  type ResendMarketingConfig,
} from './resend-marketing';
import { recordDeliveryLogs } from './delivery';
import { renderEmail, getDefaultBrandSettings } from './templates';

export interface BroadcastSendResult {
  success: boolean;
  broadcastId?: string;
  sent: number;
  failed: number;
  error?: string;
  results: Array<{ email: string; success: boolean; contactId?: string; error?: string }>;
}

/**
 * Get target subscribers for a campaign.
 * If contact_list_id is set, get list members only.
 * Otherwise get all active subscribers.
 */
export async function getTargetSubscribers(
  campaign: Campaign,
  env: Env
): Promise<(Subscriber & { resend_contact_id?: string | null })[]> {
  let result;

  if (campaign.contact_list_id) {
    result = await env.DB.prepare(`
      SELECT s.* FROM subscribers s
      JOIN contact_list_members clm ON s.id = clm.subscriber_id
      WHERE clm.contact_list_id = ? AND s.status = 'active'
    `).bind(campaign.contact_list_id).all<Subscriber & { resend_contact_id?: string | null }>();
  } else {
    result = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE status = 'active'"
    ).all<Subscriber & { resend_contact_id?: string | null }>();
  }

  return result.results || [];
}

/**
 * Send a campaign via Resend Broadcast API.
 *
 * Flow:
 * 1. Get target subscribers
 * 2. Ensure Resend Contact for each (lazy sync)
 * 3. Create temp Segment
 * 4. Add contacts to Segment
 * 5. Create & Send Broadcast
 * 6. Delete temp Segment (cleanup)
 * 7. Record delivery logs
 */
export async function sendCampaignViaBroadcast(
  campaign: Campaign,
  env: Env
): Promise<BroadcastSendResult> {
  // Check for required config
  if (!env.RESEND_AUDIENCE_ID) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: 'RESEND_AUDIENCE_ID is not configured',
      results: [],
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
    audienceId: env.RESEND_AUDIENCE_ID,
  };

  let segmentId: string | null = null;
  const results: Array<{ email: string; success: boolean; contactId?: string; error?: string }> = [];

  try {
    // 1. Get target subscribers
    const subscribers = await getTargetSubscribers(campaign, env);

    if (subscribers.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        error: 'No active subscribers',
        results: [],
      };
    }

    // 2. Ensure Resend Contact for each subscriber
    const contactIds: string[] = [];

    for (const subscriber of subscribers) {
      const contactResult = await ensureResendContact(subscriber, config, env);

      if (contactResult.success && contactResult.contactId) {
        contactIds.push(contactResult.contactId);
        results.push({
          email: subscriber.email,
          success: true,
          contactId: contactResult.contactId,
        });
      } else {
        // Skip subscriber but continue with others
        console.warn(`Skipping subscriber ${subscriber.email}: ${contactResult.error}`);
        results.push({
          email: subscriber.email,
          success: false,
          error: contactResult.error,
        });
      }
    }

    if (contactIds.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: 'Failed to create contacts for all subscribers',
        results,
      };
    }

    // 3. Create temp Segment
    const segmentResult = await createTempSegment(`campaign-${campaign.id}`, config);

    if (!segmentResult.success || !segmentResult.segmentId) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to create segment: ${segmentResult.error}`,
        results,
      };
    }

    segmentId = segmentResult.segmentId;

    // 4. Add contacts to Segment
    const addResult = await addContactsToSegment(segmentId, contactIds, config);

    if (!addResult.success) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to add contacts to segment: ${addResult.error}`,
        results,
      };
    }

    // 5. Get brand settings and prepare email content
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const templateId = campaign.template_id || brandSettings.default_template_id;

    // Use first subscriber for template rendering (personalization would require individual sends)
    const firstSubscriber = subscribers[0];
    const html = renderEmail({
      templateId,
      content: campaign.content,
      subject: campaign.subject,
      brandSettings,
      subscriber: { name: firstSubscriber.name, email: firstSubscriber.email },
      unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/{{unsubscribe_token}}`,
      siteUrl: env.SITE_URL,
    });

    // 6. Create & Send Broadcast
    const broadcastResult = await createAndSendBroadcast(
      {
        segmentId,
        from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        subject: campaign.subject,
        html,
      },
      config
    );

    if (!broadcastResult.success) {
      return {
        success: false,
        sent: 0,
        failed: results.length,
        error: `Failed to send broadcast: ${broadcastResult.error}`,
        results,
      };
    }

    // 7. Record delivery logs
    const successfulSubscribers = subscribers.filter((sub) =>
      results.find((r) => r.email === sub.email && r.success)
    );

    const deliveryResults = successfulSubscribers.map((sub) => ({
      email: sub.email,
      success: true,
      resendId: broadcastResult.broadcastId,
    }));

    await recordDeliveryLogs(env, campaign.id, successfulSubscribers, deliveryResults);

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      broadcastId: broadcastResult.broadcastId,
      sent: successCount,
      failed: failedCount,
      results,
    };
  } finally {
    // 8. Cleanup: Delete temp Segment (best effort)
    if (segmentId) {
      await deleteSegment(segmentId, config).catch((e) =>
        console.error('Segment cleanup failed:', e)
      );
    }
  }
}
```

**Step 5.2: Verify TypeScript compiles**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npx tsc --noEmit
```

Expected output: No errors.

**Step 5.3: Commit**

```bash
git add src/lib/broadcast-sender.ts
git commit -m "feat(broadcast): implement sendCampaignViaBroadcast() function

Implements the main campaign broadcast flow:
1. Get target subscribers (list-based or all)
2. Ensure Resend Contact for each (lazy sync)
3. Create temp Segment
4. Add contacts to Segment
5. Create & Send Broadcast
6. Delete temp Segment (cleanup)
7. Record delivery logs

Includes proper error handling and cleanup in finally block.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Write tests for sendCampaignViaBroadcast()

**Files:**
- Create: `workers/newsletter/src/__tests__/broadcast-sender.test.ts`

**Step 6.1: Create test file**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { sendCampaignViaBroadcast, getTargetSubscribers } from '../lib/broadcast-sender';
import type { Campaign } from '../types';

// Mock resend-marketing module
vi.mock('../lib/resend-marketing', () => ({
  ensureResendContact: vi.fn(),
  createTempSegment: vi.fn(),
  addContactsToSegment: vi.fn(),
  deleteSegment: vi.fn(),
  createAndSendBroadcast: vi.fn(),
}));

import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
} from '../lib/resend-marketing';

const mockEnsureResendContact = vi.mocked(ensureResendContact);
const mockCreateTempSegment = vi.mocked(createTempSegment);
const mockAddContactsToSegment = vi.mocked(addContactsToSegment);
const mockDeleteSegment = vi.mocked(deleteSegment);
const mockCreateAndSendBroadcast = vi.mocked(createAndSendBroadcast);

describe('getTargetSubscribers', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return all active subscribers when no contact_list_id', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status) VALUES
      ('sub1', 'active1@example.com', 'active'),
      ('sub2', 'active2@example.com', 'active'),
      ('sub3', 'inactive@example.com', 'unsubscribed')
    `).run();

    const campaign = { id: 'camp1', contact_list_id: null } as Campaign;
    const subscribers = await getTargetSubscribers(campaign, env);

    expect(subscribers).toHaveLength(2);
    expect(subscribers.map((s) => s.email)).toContain('active1@example.com');
    expect(subscribers.map((s) => s.email)).toContain('active2@example.com');
  });

  it('should return only list members when contact_list_id is set', async () => {
    const env = getTestEnv();

    // Create subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status) VALUES
      ('sub1', 'member@example.com', 'active'),
      ('sub2', 'nonmember@example.com', 'active')
    `).run();

    // Create contact list and add one member
    await env.DB.prepare(`
      INSERT INTO contact_lists (id, name) VALUES ('list1', 'Test List')
    `).run();

    await env.DB.prepare(`
      INSERT INTO contact_list_members (id, contact_list_id, subscriber_id) VALUES
      ('clm1', 'list1', 'sub1')
    `).run();

    const campaign = { id: 'camp1', contact_list_id: 'list1' } as Campaign;
    const subscribers = await getTargetSubscribers(campaign, env);

    expect(subscribers).toHaveLength(1);
    expect(subscribers[0].email).toBe('member@example.com');
  });
});

describe('sendCampaignViaBroadcast', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return error if RESEND_AUDIENCE_ID is not configured', async () => {
    const env = getTestEnv();
    // @ts-expect-error - Testing missing config
    delete env.RESEND_AUDIENCE_ID;

    const campaign = { id: 'camp1', subject: 'Test', content: '<p>Test</p>' } as Campaign;
    const result = await sendCampaignViaBroadcast(campaign, env);

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_AUDIENCE_ID');
  });

  it('should return error if no active subscribers', async () => {
    const env = getTestEnv();

    // No subscribers inserted
    const campaign = { id: 'camp1', subject: 'Test', content: '<p>Test</p>' } as Campaign;
    const result = await sendCampaignViaBroadcast(campaign, env);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No active subscribers');
  });

  it('should successfully send campaign via broadcast', async () => {
    const env = getTestEnv();

    // Create test subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token) VALUES
      ('sub1', 'test1@example.com', 'Test User 1', 'active', 'token1'),
      ('sub2', 'test2@example.com', 'Test User 2', 'active', 'token2')
    `).run();

    // Create test campaign
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status) VALUES
      ('camp1', 'Test Subject', '<p>Test Content</p>', 'draft')
    `).run();

    // Mock successful responses
    mockEnsureResendContact
      .mockResolvedValueOnce({ success: true, contactId: 'contact1' })
      .mockResolvedValueOnce({ success: true, contactId: 'contact2' });
    mockCreateTempSegment.mockResolvedValueOnce({ success: true, segmentId: 'seg1' });
    mockAddContactsToSegment.mockResolvedValueOnce({ success: true });
    mockCreateAndSendBroadcast.mockResolvedValueOnce({ success: true, broadcastId: 'bc1' });
    mockDeleteSegment.mockResolvedValueOnce({ success: true });

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind('camp1').first() as Campaign;

    const result = await sendCampaignViaBroadcast(campaign, env);

    expect(result.success).toBe(true);
    expect(result.broadcastId).toBe('bc1');
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    // Verify segment was created with campaign ID prefix
    expect(mockCreateTempSegment).toHaveBeenCalledWith(
      'campaign-camp1',
      expect.any(Object)
    );

    // Verify contacts were added to segment
    expect(mockAddContactsToSegment).toHaveBeenCalledWith(
      'seg1',
      ['contact1', 'contact2'],
      expect.any(Object)
    );

    // Verify segment cleanup was called
    expect(mockDeleteSegment).toHaveBeenCalledWith('seg1', expect.any(Object));

    // Verify delivery logs were created
    const logs = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE campaign_id = ?'
    ).bind('camp1').all();
    expect(logs.results).toHaveLength(2);
  });

  it('should handle partial contact creation failure', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token) VALUES
      ('sub1', 'success@example.com', 'Success User', 'active', 'token1'),
      ('sub2', 'fail@example.com', 'Fail User', 'active', 'token2')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status) VALUES
      ('camp1', 'Test', '<p>Test</p>', 'draft')
    `).run();

    // First contact succeeds, second fails
    mockEnsureResendContact
      .mockResolvedValueOnce({ success: true, contactId: 'contact1' })
      .mockResolvedValueOnce({ success: false, error: 'Invalid email' });
    mockCreateTempSegment.mockResolvedValueOnce({ success: true, segmentId: 'seg1' });
    mockAddContactsToSegment.mockResolvedValueOnce({ success: true });
    mockCreateAndSendBroadcast.mockResolvedValueOnce({ success: true, broadcastId: 'bc1' });
    mockDeleteSegment.mockResolvedValueOnce({ success: true });

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind('camp1').first() as Campaign;

    const result = await sendCampaignViaBroadcast(campaign, env);

    expect(result.success).toBe(true);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    // Should only add successful contact to segment
    expect(mockAddContactsToSegment).toHaveBeenCalledWith(
      'seg1',
      ['contact1'],
      expect.any(Object)
    );
  });

  it('should cleanup segment on broadcast failure', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token) VALUES
      ('sub1', 'test@example.com', 'active', 'token1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status) VALUES
      ('camp1', 'Test', '<p>Test</p>', 'draft')
    `).run();

    mockEnsureResendContact.mockResolvedValueOnce({ success: true, contactId: 'contact1' });
    mockCreateTempSegment.mockResolvedValueOnce({ success: true, segmentId: 'seg1' });
    mockAddContactsToSegment.mockResolvedValueOnce({ success: true });
    mockCreateAndSendBroadcast.mockResolvedValueOnce({
      success: false,
      error: 'Broadcast failed',
    });
    mockDeleteSegment.mockResolvedValueOnce({ success: true });

    const campaign = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind('camp1').first() as Campaign;

    const result = await sendCampaignViaBroadcast(campaign, env);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Broadcast failed');

    // Segment should still be cleaned up
    expect(mockDeleteSegment).toHaveBeenCalledWith('seg1', expect.any(Object));
  });
});
```

**Step 6.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/broadcast-sender.test.ts
```

Expected output: All tests pass.

**Step 6.3: Commit**

```bash
git add src/__tests__/broadcast-sender.test.ts
git commit -m "test(broadcast): add unit tests for sendCampaignViaBroadcast()

Tests cover:
- getTargetSubscribers() with and without contact_list_id
- Missing RESEND_AUDIENCE_ID configuration
- No active subscribers scenario
- Successful campaign broadcast flow
- Partial contact creation failure handling
- Segment cleanup on broadcast failure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Add feature flag to switch between Email API and Broadcast API

**Files:**
- Modify: `workers/newsletter/src/types.ts`
- Modify: `workers/newsletter/src/__tests__/setup.ts`
- Modify: `workers/newsletter/src/routes/campaign-send.ts`

**Step 7.1: Add USE_BROADCAST_API flag to Env**

In types.ts, add after `RESEND_AUDIENCE_ID`:

```typescript
USE_BROADCAST_API?: string; // Optional: set to 'true' to use Broadcast API
```

**Step 7.2: Update test setup.ts**

Add to `getTestEnv()`:

```typescript
USE_BROADCAST_API: 'false', // Default to Email API for backwards compatibility
```

**Step 7.3: Update campaign-send.ts**

Replace the imports and sendCampaign function:

```typescript
import type { Env, Campaign, Subscriber, BrandSettings } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';
import { recordDeliveryLogs, getDeliveryStats } from '../lib/delivery';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmail, getDefaultBrandSettings } from '../lib/templates';
import { sendCampaignViaBroadcast } from '../lib/broadcast-sender';

export async function sendCampaign(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
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

    // Check if Broadcast API should be used
    const useBroadcastApi = env.USE_BROADCAST_API === 'true' && !!env.RESEND_AUDIENCE_ID;

    if (useBroadcastApi) {
      // Use Broadcast API
      const result = await sendCampaignViaBroadcast(campaign, env);

      if (!result.success) {
        // Update campaign status to failed
        await env.DB.prepare(`
          UPDATE campaigns SET status = 'failed' WHERE id = ?
        `).bind(campaignId).run();

        return errorResponse(result.error || 'Broadcast send failed', 500);
      }

      // Update campaign status
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE campaigns
        SET status = 'sent', sent_at = ?, recipient_count = ?
        WHERE id = ?
      `).bind(now, result.sent, campaignId).run();

      // Get delivery stats
      const stats = await getDeliveryStats(env, campaignId);

      return successResponse({
        campaignId,
        sent: result.sent,
        total: result.sent + result.failed,
        broadcastId: result.broadcastId,
        stats,
      });
    }

    // Original Email API flow
    // Get active subscribers (list-based or broadcast)
    let subscribersResult;

    if (campaign.contact_list_id) {
      // List-based delivery: send only to members of the specified list
      subscribersResult = await env.DB.prepare(
        `SELECT s.* FROM subscribers s
         JOIN contact_list_members clm ON s.id = clm.subscriber_id
         WHERE clm.contact_list_id = ? AND s.status = 'active'`
      ).bind(campaign.contact_list_id).all<Subscriber>();
    } else {
      // Broadcast delivery: send to all active subscribers (default behavior)
      subscribersResult = await env.DB.prepare(
        "SELECT * FROM subscribers WHERE status = 'active'"
      ).all<Subscriber>();
    }

    const subscribers = subscribersResult.results || [];

    if (subscribers.length === 0) {
      return errorResponse('No active subscribers', 400);
    }

    // Get brand settings
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const templateId = campaign.template_id || brandSettings.default_template_id;

    // Prepare emails using template engine
    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject: campaign.subject,
      html: renderEmail({
        templateId,
        content: campaign.content,
        subject: campaign.subject,
        brandSettings,
        subscriber: { name: sub.name, email: sub.email },
        unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
        siteUrl: env.SITE_URL,
      }),
    }));

    // Send batch emails
    const sendResult = await sendBatchEmails(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      emails
    );

    // Record delivery logs with resend IDs from batch send results
    const resultMap = new Map(sendResult.results.map(r => [r.email, r]));
    const deliveryResults = subscribers.map((sub) => {
      const result = resultMap.get(sub.email);
      return {
        email: sub.email,
        success: sendResult.success && !result?.error,
        resendId: result?.resendId,
        error: result?.error || sendResult.error,
      };
    });
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
      campaignId,
      sent: sendResult.sent,
      total: subscribers.length,
      stats,
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
  if (!(await isAuthorizedAsync(request, env))) {
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
      campaign,
      stats,
      openRate: stats.total > 0 ? (stats.opened / stats.total * 100).toFixed(2) + '%' : '0%',
      clickRate: stats.total > 0 ? (stats.clicked / stats.total * 100).toFixed(2) + '%' : '0%',
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 7.4: Verify existing tests still pass**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/campaign-send.test.ts
```

Expected output: All tests pass.

**Step 7.5: Commit**

```bash
git add src/types.ts src/__tests__/setup.ts src/routes/campaign-send.ts
git commit -m "feat(campaign-send): add feature flag for Broadcast API

Adds USE_BROADCAST_API feature flag to switch between Email API and
Broadcast API. When USE_BROADCAST_API='true' and RESEND_AUDIENCE_ID is
configured, campaigns use the new Broadcast API flow.

Default is 'false' for backwards compatibility with existing Email API.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Add integration test for Broadcast API campaign send

**Files:**
- Modify: `workers/newsletter/src/__tests__/campaign-send.test.ts`

**Step 8.1: Add new test cases**

Add at the end of the file:

```typescript
describe('Campaign Send with Broadcast API', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should use Broadcast API when feature flag is enabled', async () => {
    const { sendCampaignViaBroadcast } = await import('../lib/broadcast-sender');
    vi.mock('../lib/broadcast-sender', () => ({
      sendCampaignViaBroadcast: vi.fn().mockResolvedValue({
        success: true,
        broadcastId: 'bc_123',
        sent: 1,
        failed: 0,
        results: [{ email: 'test@example.com', success: true, contactId: 'c_123' }],
      }),
      getTargetSubscribers: vi.fn(),
    }));

    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_123',
    };

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'active', 'token')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-bc', 'Broadcast Test', '<p>Test</p>', 'draft')
    `).run();

    const request = new Request('http://localhost/api/campaigns/camp-bc/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
    });

    // Note: This test verifies the feature flag routing
    // The actual broadcast sending is mocked
    const { sendCampaign } = await import('../routes/campaign-send');
    const response = await sendCampaign(request, env, 'camp-bc');
    const result = await response.json();

    // Should succeed (using mocked broadcast)
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
  });

  it('should fall back to Email API when USE_BROADCAST_API is false', async () => {
    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'false',
      RESEND_AUDIENCE_ID: 'aud_123',
    };

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'active', 'token')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-email', 'Email API Test', '<p>Test</p>', 'draft')
    `).run();

    const request = new Request('http://localhost/api/campaigns/camp-email/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
    });

    const { sendCampaign } = await import('../routes/campaign-send');
    const response = await sendCampaign(request, env, 'camp-email');
    const result = await response.json();

    // Should succeed using mocked Email API (from top of file)
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
  });
});
```

**Step 8.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/campaign-send.test.ts
```

Expected output: All tests pass.

**Step 8.3: Commit**

```bash
git add src/__tests__/campaign-send.test.ts
git commit -m "test(campaign-send): add tests for Broadcast API feature flag

Tests verify:
- Broadcast API is used when USE_BROADCAST_API=true and RESEND_AUDIENCE_ID set
- Falls back to Email API when USE_BROADCAST_API=false

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Sequence Integration (Tasks 9-11)

### Task 9: Create sendSequenceStepViaBroadcast() function

**Files:**
- Modify: `workers/newsletter/src/lib/broadcast-sender.ts`

**Step 9.1: Add sequence broadcast function**

Add to broadcast-sender.ts:

```typescript
import type { SequenceStep } from '../types';
import { recordSequenceDeliveryLog } from './delivery';

export interface SequenceBroadcastResult {
  success: boolean;
  broadcastId?: string;
  error?: string;
}

/**
 * Send a single sequence step email via Resend Broadcast API.
 *
 * Flow:
 * 1. Ensure Resend Contact (lazy sync)
 * 2. Create single-contact temp Segment
 * 3. Create & Send Broadcast
 * 4. Delete temp Segment (cleanup)
 * 5. Record delivery log
 */
export async function sendSequenceStepViaBroadcast(
  subscriber: Subscriber & { resend_contact_id?: string | null },
  step: SequenceStep,
  brandSettings: BrandSettings,
  env: Env
): Promise<SequenceBroadcastResult> {
  // Check for required config
  if (!env.RESEND_AUDIENCE_ID) {
    return {
      success: false,
      error: 'RESEND_AUDIENCE_ID is not configured',
    };
  }

  const config: ResendMarketingConfig = {
    apiKey: env.RESEND_API_KEY,
    audienceId: env.RESEND_AUDIENCE_ID,
  };

  let segmentId: string | null = null;

  try {
    // 1. Ensure Resend Contact
    const contactResult = await ensureResendContact(subscriber, config, env);

    if (!contactResult.success || !contactResult.contactId) {
      return {
        success: false,
        error: `Failed to create contact: ${contactResult.error}`,
      };
    }

    // 2. Create single-contact temp Segment
    const segmentResult = await createTempSegment(
      `seq-${step.sequence_id}-${subscriber.id}`,
      config
    );

    if (!segmentResult.success || !segmentResult.segmentId) {
      return {
        success: false,
        error: `Failed to create segment: ${segmentResult.error}`,
      };
    }

    segmentId = segmentResult.segmentId;

    // 3. Add contact to Segment
    const addResult = await addContactsToSegment(
      segmentId,
      [contactResult.contactId],
      config
    );

    if (!addResult.success) {
      return {
        success: false,
        error: `Failed to add contact to segment: ${addResult.error}`,
      };
    }

    // 4. Prepare email content
    const templateId = step.template_id || brandSettings.default_template_id;
    const unsubscribeUrl = `${env.SITE_URL}/api/newsletter/unsubscribe/${subscriber.unsubscribe_token}`;

    const html = renderEmail({
      templateId,
      content: step.content,
      subject: step.subject,
      brandSettings,
      subscriber: { name: subscriber.name, email: subscriber.email },
      unsubscribeUrl,
      siteUrl: env.SITE_URL,
    });

    // 5. Create & Send Broadcast
    const broadcastResult = await createAndSendBroadcast(
      {
        segmentId,
        from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        subject: step.subject,
        html,
      },
      config
    );

    if (!broadcastResult.success) {
      // Record failed delivery log
      await recordSequenceDeliveryLog(env, {
        sequenceId: step.sequence_id,
        sequenceStepId: step.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        emailSubject: step.subject,
        status: 'failed',
        errorMessage: broadcastResult.error,
      });

      return {
        success: false,
        error: `Failed to send broadcast: ${broadcastResult.error}`,
      };
    }

    // 6. Record successful delivery log
    await recordSequenceDeliveryLog(env, {
      sequenceId: step.sequence_id,
      sequenceStepId: step.id,
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailSubject: step.subject,
      resendId: broadcastResult.broadcastId,
    });

    return {
      success: true,
      broadcastId: broadcastResult.broadcastId,
    };
  } finally {
    // 7. Cleanup: Delete temp Segment (best effort)
    if (segmentId) {
      await deleteSegment(segmentId, config).catch((e) =>
        console.error('Segment cleanup failed:', e)
      );
    }
  }
}
```

**Step 9.2: Update imports at top of file**

Make sure imports include:

```typescript
import type { Env, Campaign, Subscriber, BrandSettings, SequenceStep } from '../types';
import { recordDeliveryLogs, recordSequenceDeliveryLog } from './delivery';
```

**Step 9.3: Verify TypeScript compiles**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npx tsc --noEmit
```

Expected output: No errors.

**Step 9.4: Commit**

```bash
git add src/lib/broadcast-sender.ts
git commit -m "feat(broadcast): implement sendSequenceStepViaBroadcast() function

Implements sequence step broadcast flow:
1. Ensure Resend Contact (lazy sync)
2. Create single-contact temp Segment
3. Add contact to Segment
4. Create & Send Broadcast
5. Delete temp Segment (cleanup)
6. Record delivery log

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 10: Add tests for sendSequenceStepViaBroadcast()

**Files:**
- Modify: `workers/newsletter/src/__tests__/broadcast-sender.test.ts`

**Step 10.1: Add test cases**

Add to broadcast-sender.test.ts:

```typescript
import { sendSequenceStepViaBroadcast } from '../lib/broadcast-sender';
import type { SequenceStep, BrandSettings } from '../types';

describe('sendSequenceStepViaBroadcast', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return error if RESEND_AUDIENCE_ID is not configured', async () => {
    const env = getTestEnv();
    // @ts-expect-error - Testing missing config
    delete env.RESEND_AUDIENCE_ID;

    const subscriber = {
      id: 'sub1',
      email: 'test@example.com',
      name: 'Test',
      status: 'active' as const,
      unsubscribe_token: 'token1',
    };

    const step: SequenceStep = {
      id: 'step1',
      sequence_id: 'seq1',
      step_number: 1,
      delay_days: 0,
      subject: 'Test Step',
      content: '<p>Test</p>',
      is_enabled: 1,
      template_id: null,
      created_at: Date.now(),
    };

    const brandSettings: BrandSettings = {
      id: 'default',
      logo_url: null,
      primary_color: '#7c3aed',
      secondary_color: '#1e1e1e',
      footer_text: 'Test',
      default_template_id: 'simple',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const result = await sendSequenceStepViaBroadcast(
      subscriber as any,
      step,
      brandSettings,
      env
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_AUDIENCE_ID');
  });

  it('should successfully send sequence step via broadcast', async () => {
    const env = getTestEnv();

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub1', 'test@example.com', 'Test User', 'active', 'token1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active, default_send_time)
      VALUES ('seq1', 'Test Sequence', 1, '10:00')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content, is_enabled)
      VALUES ('step1', 'seq1', 1, 0, 'Step 1 Subject', '<p>Step 1 Content</p>', 1)
    `).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind('sub1').first();

    const step = await env.DB.prepare(
      'SELECT * FROM sequence_steps WHERE id = ?'
    ).bind('step1').first() as SequenceStep;

    const brandSettings: BrandSettings = {
      id: 'default',
      logo_url: null,
      primary_color: '#7c3aed',
      secondary_color: '#1e1e1e',
      footer_text: 'Test',
      default_template_id: 'simple',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Mock successful responses
    mockEnsureResendContact.mockResolvedValueOnce({
      success: true,
      contactId: 'contact1',
    });
    mockCreateTempSegment.mockResolvedValueOnce({
      success: true,
      segmentId: 'seg1',
    });
    mockAddContactsToSegment.mockResolvedValueOnce({ success: true });
    mockCreateAndSendBroadcast.mockResolvedValueOnce({
      success: true,
      broadcastId: 'bc1',
    });
    mockDeleteSegment.mockResolvedValueOnce({ success: true });

    const result = await sendSequenceStepViaBroadcast(
      subscriber as any,
      step,
      brandSettings,
      env
    );

    expect(result.success).toBe(true);
    expect(result.broadcastId).toBe('bc1');

    // Verify segment name includes sequence and subscriber IDs
    expect(mockCreateTempSegment).toHaveBeenCalledWith(
      'seq-seq1-sub1',
      expect.any(Object)
    );

    // Verify single contact added to segment
    expect(mockAddContactsToSegment).toHaveBeenCalledWith(
      'seg1',
      ['contact1'],
      expect.any(Object)
    );

    // Verify delivery log was created
    const logs = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ?'
    ).bind('seq1').all();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].status).toBe('sent');
    expect(logs.results[0].resend_id).toBe('bc1');
  });

  it('should record failed delivery log on broadcast failure', async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub1', 'test@example.com', 'Test User', 'active', 'token1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active, default_send_time)
      VALUES ('seq1', 'Test Sequence', 1, '10:00')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content, is_enabled)
      VALUES ('step1', 'seq1', 1, 0, 'Step 1', '<p>Content</p>', 1)
    `).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind('sub1').first();

    const step = await env.DB.prepare(
      'SELECT * FROM sequence_steps WHERE id = ?'
    ).bind('step1').first() as SequenceStep;

    const brandSettings: BrandSettings = {
      id: 'default',
      logo_url: null,
      primary_color: '#7c3aed',
      secondary_color: '#1e1e1e',
      footer_text: 'Test',
      default_template_id: 'simple',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    mockEnsureResendContact.mockResolvedValueOnce({
      success: true,
      contactId: 'contact1',
    });
    mockCreateTempSegment.mockResolvedValueOnce({
      success: true,
      segmentId: 'seg1',
    });
    mockAddContactsToSegment.mockResolvedValueOnce({ success: true });
    mockCreateAndSendBroadcast.mockResolvedValueOnce({
      success: false,
      error: 'Broadcast failed',
    });
    mockDeleteSegment.mockResolvedValueOnce({ success: true });

    const result = await sendSequenceStepViaBroadcast(
      subscriber as any,
      step,
      brandSettings,
      env
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Broadcast failed');

    // Verify failed delivery log was created
    const logs = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ?'
    ).bind('seq1').all();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].status).toBe('failed');
    expect(logs.results[0].error_message).toContain('Broadcast failed');

    // Verify segment was cleaned up
    expect(mockDeleteSegment).toHaveBeenCalled();
  });
});
```

**Step 10.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/broadcast-sender.test.ts
```

Expected output: All tests pass.

**Step 10.3: Commit**

```bash
git add src/__tests__/broadcast-sender.test.ts
git commit -m "test(broadcast): add tests for sendSequenceStepViaBroadcast()

Tests cover:
- Missing RESEND_AUDIENCE_ID configuration
- Successful sequence step broadcast
- Failed delivery log recording on broadcast failure
- Segment cleanup in all cases

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 11: Update sequence-processor.ts to use Broadcast API with feature flag

**Files:**
- Modify: `workers/newsletter/src/lib/sequence-processor.ts`

**Step 11.1: Update imports**

Add at top of file:

```typescript
import { sendSequenceStepViaBroadcast } from './broadcast-sender';
```

**Step 11.2: Update processSequenceEmails function**

Replace the email sending logic inside the for loop (after `console.log(`Sending sequence email to ${email.email}, step ${email.step_number}`);`):

```typescript
      // Determine template: step template_id > brand default > 'simple'
      const templateId = email.template_id || brandSettings.default_template_id || 'simple';
      const unsubscribeUrl = `${env.SITE_URL}/api/newsletter/unsubscribe/${email.unsubscribe_token}`;

      // Check if Broadcast API should be used
      const useBroadcastApi = env.USE_BROADCAST_API === 'true' && !!env.RESEND_AUDIENCE_ID;

      let result: { success: boolean; id?: string; error?: string };

      if (useBroadcastApi) {
        // Use Broadcast API
        const subscriber = {
          id: email.subscriber_id,
          email: email.email,
          name: email.name,
          status: 'active' as const,
          unsubscribe_token: email.unsubscribe_token,
          resend_contact_id: null, // Will be fetched/created by ensureResendContact
          confirm_token: null,
          signup_page_slug: null,
          subscribed_at: null,
          unsubscribed_at: null,
          created_at: 0,
          referral_code: null,
          referred_by: null,
          referral_count: 0,
        };

        const step = {
          id: email.step_id,
          sequence_id: email.sequence_id,
          step_number: email.step_number,
          delay_days: 0, // Not used in broadcast
          subject: email.subject,
          content: email.content,
          is_enabled: 1,
          template_id: email.template_id,
          created_at: 0,
        };

        const broadcastResult = await sendSequenceStepViaBroadcast(
          subscriber,
          step,
          brandSettings,
          env
        );

        result = {
          success: broadcastResult.success,
          id: broadcastResult.broadcastId,
          error: broadcastResult.error,
        };

        // Note: sendSequenceStepViaBroadcast already records delivery log
        // So we skip recording here and only update progress
      } else {
        // Use Email API (original flow)
        result = await sendEmail(
          env.RESEND_API_KEY,
          `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
          {
            to: email.email,
            subject: email.subject,
            html: renderEmail({
              templateId,
              content: email.content,
              subject: email.subject,
              brandSettings,
              subscriber: { name: email.name, email: email.email },
              unsubscribeUrl,
              siteUrl: env.SITE_URL,
            }),
          }
        );

        // Record delivery log for Email API
        if (result.success) {
          try {
            await recordSequenceDeliveryLog(env, {
              sequenceId: email.sequence_id,
              sequenceStepId: email.step_id,
              subscriberId: email.subscriber_id,
              email: email.email,
              emailSubject: email.subject,
              resendId: result.id,
            });
          } catch (logError) {
            console.error('Failed to record sequence delivery log:', logError);
          }
        } else {
          try {
            await recordSequenceDeliveryLog(env, {
              sequenceId: email.sequence_id,
              sequenceStepId: email.step_id,
              subscriberId: email.subscriber_id,
              email: email.email,
              emailSubject: email.subject,
              status: 'failed',
              errorMessage: result.error,
            });
          } catch (logError) {
            console.error('Failed to record sequence delivery log:', logError);
          }
        }
      }

      if (result.success) {
        // Check if this is the last step (only count enabled steps)
        const totalSteps = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM sequence_steps WHERE sequence_id = ? AND is_enabled = 1'
        ).bind(email.sequence_id).first<{ count: number }>();

        const isComplete = email.step_number >= (totalSteps?.count || 0);

        // Update progress
        await env.DB.prepare(`
          UPDATE subscriber_sequences
          SET current_step = ?,
              completed_at = ?
          WHERE id = ?
        `).bind(
          email.step_number,
          isComplete ? now : null,
          email.subscriber_sequence_id
        ).run();

        console.log(`Sequence step ${email.step_number} sent to ${email.email}${isComplete ? ' (completed)' : ''}`);
      } else {
        console.error(`Failed to send sequence email to ${email.email}:`, result.error);
      }
```

**Step 11.3: Verify existing tests still pass**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/sequence-processor.test.ts
```

Expected output: All tests pass.

**Step 11.4: Commit**

```bash
git add src/lib/sequence-processor.ts
git commit -m "feat(sequence): add Broadcast API support with feature flag

Updates processSequenceEmails to use Broadcast API when
USE_BROADCAST_API='true' and RESEND_AUDIENCE_ID is configured.

- Broadcast API flow uses sendSequenceStepViaBroadcast()
- Email API flow preserved for backwards compatibility
- Delivery logs recorded by both flows (broadcast handles its own)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Cleanup & Testing (Tasks 12-14)

### Task 12: E2E test for campaign broadcast flow

**Files:**
- Create: `workers/newsletter/src/__tests__/broadcast-e2e.test.ts`

**Step 12.1: Create E2E test file**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { sendCampaign } from '../routes/campaign-send';

// Mock fetch for Resend API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Campaign Broadcast E2E', () => {
  beforeEach(async () => {
    await setupTestDb();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should complete full broadcast flow: contact creation -> segment -> broadcast -> cleanup', async () => {
    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_test123',
    };

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES
        ('sub1', 'user1@example.com', 'User One', 'active', 'token1'),
        ('sub2', 'user2@example.com', 'User Two', 'active', 'token2')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp1', 'E2E Test Campaign', '<p>Test Content</p>', 'draft')
    `).run();

    // Mock all Resend API responses in sequence
    // 1. Contact creation for sub1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact_1' }),
    });
    // 2. Contact creation for sub2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact_2' }),
    });
    // 3. Segment creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'seg_123' }),
    });
    // 4. Add contacts to segment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // 5. Create broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bc_123' }),
    });
    // 6. Send broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // 7. Delete segment (cleanup)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const request = new Request('http://localhost/api/campaigns/camp1/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp1');
    const result = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.sent).toBe(2);
    expect(result.data.broadcastId).toBe('bc_123');

    // Verify campaign status updated
    const campaign = await env.DB.prepare(
      'SELECT status, sent_at, recipient_count FROM campaigns WHERE id = ?'
    ).bind('camp1').first();
    expect(campaign?.status).toBe('sent');
    expect(campaign?.recipient_count).toBe(2);

    // Verify contact IDs cached in D1
    const sub1 = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub1').first();
    expect(sub1?.resend_contact_id).toBe('contact_1');

    const sub2 = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub2').first();
    expect(sub2?.resend_contact_id).toBe('contact_2');

    // Verify delivery logs created
    const logs = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE campaign_id = ?'
    ).bind('camp1').all();
    expect(logs.results).toHaveLength(2);
    expect(logs.results[0].resend_id).toBe('bc_123');

    // Verify API calls made in correct order
    expect(mockFetch).toHaveBeenCalledTimes(7);

    // Contact creation calls
    expect(mockFetch.mock.calls[0][0]).toContain('/contacts');
    expect(mockFetch.mock.calls[1][0]).toContain('/contacts');

    // Segment creation
    expect(mockFetch.mock.calls[2][0]).toContain('/segments');

    // Add contacts to segment
    expect(mockFetch.mock.calls[3][0]).toContain('/segments/seg_123/contacts');

    // Broadcast creation and send
    expect(mockFetch.mock.calls[4][0]).toBe('https://api.resend.com/broadcasts');
    expect(mockFetch.mock.calls[5][0]).toBe('https://api.resend.com/broadcasts/bc_123/send');

    // Segment cleanup
    expect(mockFetch.mock.calls[6][0]).toContain('/segments/seg_123');
    expect(mockFetch.mock.calls[6][1].method).toBe('DELETE');
  });

  it('should reuse cached contact IDs on subsequent sends', async () => {
    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_test123',
    };

    // Create subscriber with existing contact ID
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token, resend_contact_id)
      VALUES ('sub1', 'cached@example.com', 'Cached User', 'active', 'token1', 'existing_contact')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp2', 'Cached Contact Test', '<p>Test</p>', 'draft')
    `).run();

    // Mock responses (no contact creation needed)
    // 1. Segment creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'seg_456' }),
    });
    // 2. Add contacts to segment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // 3. Create broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bc_456' }),
    });
    // 4. Send broadcast
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // 5. Delete segment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const request = new Request('http://localhost/api/campaigns/camp2/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp2');

    expect(response.status).toBe(200);

    // Verify no contact creation API calls (5 calls total, not 6)
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // First call should be segment creation, not contact creation
    expect(mockFetch.mock.calls[0][0]).toContain('/segments');
  });

  it('should handle contact_list_id filtering with broadcast API', async () => {
    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_test123',
    };

    // Create subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status, unsubscribe_token) VALUES
      ('sub1', 'member@example.com', 'active', 'token1'),
      ('sub2', 'nonmember@example.com', 'active', 'token2')
    `).run();

    // Create contact list and add one member
    await env.DB.prepare(`
      INSERT INTO contact_lists (id, name) VALUES ('list1', 'VIP List')
    `).run();

    await env.DB.prepare(`
      INSERT INTO contact_list_members (id, contact_list_id, subscriber_id)
      VALUES ('clm1', 'list1', 'sub1')
    `).run();

    // Create campaign with contact_list_id
    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, contact_list_id)
      VALUES ('camp3', 'List Campaign', '<p>VIP Content</p>', 'draft', 'list1')
    `).run();

    // Mock responses for single subscriber
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact_vip' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'seg_vip' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bc_vip' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const request = new Request('http://localhost/api/campaigns/camp3/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await sendCampaign(request, env, 'camp3');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.sent).toBe(1); // Only list member

    // Verify only one contact was created
    const contacts = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE resend_contact_id IS NOT NULL'
    ).all();
    expect(contacts.results).toHaveLength(1);

    // Verify it was the list member
    const member = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub1').first();
    expect(member?.resend_contact_id).toBe('contact_vip');

    // Non-member should not have contact ID
    const nonMember = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub2').first();
    expect(nonMember?.resend_contact_id).toBeNull();
  });
});
```

**Step 12.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/broadcast-e2e.test.ts
```

Expected output: All tests pass.

**Step 12.3: Commit**

```bash
git add src/__tests__/broadcast-e2e.test.ts
git commit -m "test(broadcast): add E2E tests for campaign broadcast flow

E2E tests verify:
- Full broadcast flow: contact -> segment -> broadcast -> cleanup
- Contact ID caching on subsequent sends
- contact_list_id filtering with broadcast API
- Correct API call sequence

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 13: Add sequence broadcast E2E test

**Files:**
- Modify: `workers/newsletter/src/__tests__/broadcast-e2e.test.ts`

**Step 13.1: Add sequence tests**

Add to broadcast-e2e.test.ts:

```typescript
describe('Sequence Broadcast E2E', () => {
  beforeEach(async () => {
    await setupTestDb();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should send sequence step via broadcast API', async () => {
    const env = {
      ...getTestEnv(),
      USE_BROADCAST_API: 'true',
      RESEND_AUDIENCE_ID: 'aud_test123',
    };

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub1', 'seq@example.com', 'Seq User', 'active', 'token1')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active, default_send_time)
      VALUES ('seq1', 'Welcome Sequence', 1, '10:00')
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_minutes, subject, content, is_enabled)
      VALUES ('step1', 'seq1', 1, 0, 0, 'Welcome!', '<p>Welcome to our newsletter</p>', 1)
    `).run();

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES ('ss1', 'sub1', 'seq1', 0, ?)
    `).bind(now - 60).run(); // Started 1 minute ago

    // Mock API responses
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact_seq' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'seg_seq' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bc_seq' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Import and run sequence processor
    const { processSequenceEmails } = await import('../lib/sequence-processor');
    await processSequenceEmails(env);

    // Verify subscriber progress updated
    const progress = await env.DB.prepare(
      'SELECT current_step, completed_at FROM subscriber_sequences WHERE id = ?'
    ).bind('ss1').first();
    expect(progress?.current_step).toBe(1);
    expect(progress?.completed_at).not.toBeNull(); // Single step sequence = completed

    // Verify delivery log created
    const logs = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ?'
    ).bind('seq1').all();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].resend_id).toBe('bc_seq');

    // Verify contact ID cached
    const sub = await env.DB.prepare(
      'SELECT resend_contact_id FROM subscribers WHERE id = ?'
    ).bind('sub1').first();
    expect(sub?.resend_contact_id).toBe('contact_seq');
  });
});
```

**Step 13.2: Run tests**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test -- src/__tests__/broadcast-e2e.test.ts
```

Expected output: All tests pass.

**Step 13.3: Commit**

```bash
git add src/__tests__/broadcast-e2e.test.ts
git commit -m "test(broadcast): add sequence broadcast E2E test

Tests sequence broadcast flow:
- Contact creation for sequence subscriber
- Segment creation with sequence/subscriber IDs
- Broadcast send for sequence step
- Subscriber progress tracking
- Delivery log recording

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 14: Run all tests and document deployment steps

**Files:**
- None (verification and documentation)

**Step 14.1: Run full test suite**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/resend-marketing/workers/newsletter
npm test
```

Expected output: All tests pass.

**Step 14.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected output: No errors.

**Step 14.3: Create deployment checklist**

This is documentation for production deployment (not a code change).

**Production Deployment Steps:**

1. **Set RESEND_AUDIENCE_ID secret:**
   ```bash
   cd workers/newsletter
   wrangler secret put RESEND_AUDIENCE_ID
   # Enter your Resend Audience ID when prompted
   ```

2. **Set USE_BROADCAST_API flag (optional, for gradual rollout):**
   - Start with `USE_BROADCAST_API=false` (default)
   - Test with a subset of campaigns
   - Enable globally: `wrangler secret put USE_BROADCAST_API` -> `true`

3. **Apply schema migration:**
   ```bash
   # Local
   npm run db:migrate

   # Production
   npx wrangler d1 execute edgeshift-newsletter --remote --command="ALTER TABLE subscribers ADD COLUMN resend_contact_id TEXT"
   npx wrangler d1 execute edgeshift-newsletter --remote --command="CREATE INDEX IF NOT EXISTS idx_subscribers_resend_contact_id ON subscribers(resend_contact_id)"
   ```

4. **Deploy worker:**
   ```bash
   npm run deploy
   ```

5. **Verify in production:**
   - Send test campaign with `USE_BROADCAST_API=true`
   - Check delivery logs for broadcast IDs
   - Verify contacts created in Resend dashboard

**Step 14.4: Final commit**

```bash
git add -A
git commit -m "docs: complete Resend Marketing API migration implementation

Phase 1-4 completed:
- Infrastructure: schema, service layer, types
- Campaign Integration: broadcast sender, feature flag
- Sequence Integration: sequence broadcast, processor update
- Testing: unit tests, E2E tests

Deployment requires:
- RESEND_AUDIENCE_ID secret
- USE_BROADCAST_API='true' flag
- Schema migration for resend_contact_id column

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan implements the Resend Marketing API migration in 14 granular tasks across 4 phases:

**Phase 1: Infrastructure (Tasks 1-4)**
- Schema changes for `resend_contact_id`
- Service layer for Marketing API operations
- Tests for core functions

**Phase 2: Campaign Integration (Tasks 5-8)**
- `sendCampaignViaBroadcast()` function
- Feature flag for API switching
- Integration tests

**Phase 3: Sequence Integration (Tasks 9-11)**
- `sendSequenceStepViaBroadcast()` function
- Sequence processor updates
- Tests for sequence flow

**Phase 4: Cleanup & Testing (Tasks 12-14)**
- E2E tests for full flows
- Deployment documentation
- Final verification

**Key Design Decisions:**
- D1 remains master data
- Resend Contacts are send-only cache (lazy sync)
- Temp Segments created per broadcast, deleted after
- Feature flag for gradual rollout
- Self-hosted unsubscribe preserved for SES migration readiness
