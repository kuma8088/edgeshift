# Contact List Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Contact List management to enable list-based campaign delivery and subscriber segmentation

**Architecture:** Multi-table design with contact_lists (list metadata) and contact_list_members (many-to-many join). Extends campaigns and signup_pages tables with optional contact_list_id for targeted delivery.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), React, Tailwind CSS, Vitest

---

## Task 1: Database Schema Changes

**Files:**
- Modify: `workers/newsletter/schema.sql`

**Step 1: Add contact_lists table**

```sql
-- Contact Lists table (after click_events table, before signup_pages)
CREATE TABLE IF NOT EXISTS contact_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

**Step 2: Add contact_list_members table**

```sql
-- Contact List Members table (many-to-many join)
CREATE TABLE IF NOT EXISTS contact_list_members (
  id TEXT PRIMARY KEY,
  contact_list_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  added_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(contact_list_id, subscriber_id),
  FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clm_list ON contact_list_members(contact_list_id);
CREATE INDEX IF NOT EXISTS idx_clm_subscriber ON contact_list_members(subscriber_id);
```

**Step 3: Extend campaigns table**

Note: This is a schema extension. For existing production databases, use migrations. For new databases, add to schema.sql:

```sql
-- Add to campaigns table definition (or use ALTER TABLE for existing DB)
-- ALTER TABLE campaigns ADD COLUMN contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL;
```

Update campaigns table definition to include:
```sql
contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
```

**Step 4: Extend signup_pages table**

```sql
-- Add to signup_pages table definition (or use ALTER TABLE for existing DB)
-- ALTER TABLE signup_pages ADD COLUMN contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL;
```

Update signup_pages table definition to include:
```sql
contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
```

**Step 5: Apply schema to local database**

Run: `cd workers/newsletter && npm run db:migrate`
Expected: Tables created successfully

**Step 6: Commit schema changes**

```bash
git add workers/newsletter/schema.sql
git commit -m "feat(db): add contact_lists and contact_list_members tables

- Add contact_lists table for list metadata
- Add contact_list_members table for many-to-many subscriber assignment
- Extend campaigns with contact_list_id (NULL = all active subscribers)
- Extend signup_pages with contact_list_id for auto-assignment"
```

---

## Task 2: Type Definitions

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add ContactList interface**

```typescript
export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}
```

**Step 2: Add ContactListMember interface**

```typescript
export interface ContactListMember {
  id: string;
  contact_list_id: string;
  subscriber_id: string;
  added_at: number;
}
```

**Step 3: Add request types**

```typescript
export interface CreateContactListRequest {
  name: string;
  description?: string;
}

export interface UpdateContactListRequest {
  name?: string;
  description?: string;
}

export interface AddMembersRequest {
  subscriber_ids: string[];
}
```

**Step 4: Update Campaign interface**

Add to existing Campaign interface:
```typescript
contact_list_id: string | null;
```

**Step 5: Update SignupPage interface**

Add to existing SignupPage interface (after sequence_id):
```typescript
contact_list_id: string | null;
```

**Step 6: Update CreateCampaignRequest**

Add to existing CreateCampaignRequest:
```typescript
contact_list_id?: string;
```

**Step 7: Update CreateSignupPageRequest**

Add to existing CreateSignupPageRequest:
```typescript
contact_list_id?: string;
```

**Step 8: Commit type definitions**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add Contact List type definitions"
```

---

## Task 3: Contact List CRUD API

**Files:**
- Create: `workers/newsletter/src/routes/contact-lists.ts`
- Create: `workers/newsletter/src/__tests__/contact-lists.test.ts`

**Step 1: Write failing test for list creation**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Contact Lists API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('createContactList', () => {
    it('should create a new contact list', async () => {
      const env = getTestEnv();
      const { createContactList } = await import('../routes/contact-lists');

      const result = await createContactList(env, {
        name: 'Tech Blog Readers',
        description: 'Subscribers interested in tech content',
      });

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('Tech Blog Readers');
      expect(result.description).toBe('Subscribers interested in tech content');
      expect(result.created_at).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/contact-lists.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement createContactList**

Create `workers/newsletter/src/routes/contact-lists.ts`:

```typescript
import type { Env, ContactList, CreateContactListRequest, UpdateContactListRequest } from '../types';
import { isAuthorized } from '../lib/auth';
import { jsonResponse, errorResponse, successResponse } from '../lib/response';

/**
 * Create contact list (internal, for testing)
 */
export async function createContactList(
  env: Env,
  input: CreateContactListRequest
): Promise<ContactList> {
  if (!input.name || input.name.trim() === '') {
    throw new Error('Name is required');
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO contact_lists (id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.name.trim(),
    input.description || null,
    now,
    now
  ).run();

  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists WHERE id = ?'
  ).bind(id).first();

  return result as ContactList;
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/contact-lists.test.ts`
Expected: PASS

**Step 5: Add tests for getContactLists**

```typescript
describe('getContactLists', () => {
  it('should return empty array when no lists exist', async () => {
    const env = getTestEnv();
    const { getContactLists } = await import('../routes/contact-lists');

    const result = await getContactLists(env);

    expect(result).toEqual([]);
  });

  it('should return all lists ordered by name', async () => {
    const env = getTestEnv();
    const { createContactList, getContactLists } = await import('../routes/contact-lists');

    await createContactList(env, { name: 'Beta List' });
    await createContactList(env, { name: 'Alpha List' });

    const result = await getContactLists(env);

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Alpha List');
    expect(result[1].name).toBe('Beta List');
  });
});
```

**Step 6: Implement getContactLists**

```typescript
/**
 * Get all contact lists (internal, for testing)
 */
export async function getContactLists(env: Env): Promise<ContactList[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists ORDER BY name'
  ).all();

  return result.results as ContactList[];
}
```

**Step 7: Add tests for updateContactList and deleteContactList**

```typescript
describe('updateContactList', () => {
  it('should update contact list', async () => {
    const env = getTestEnv();
    const { createContactList, updateContactList } = await import('../routes/contact-lists');

    const created = await createContactList(env, { name: 'Original' });

    const updated = await updateContactList(env, created.id, {
      name: 'Updated',
      description: 'New description',
    });

    expect(updated.name).toBe('Updated');
    expect(updated.description).toBe('New description');
    expect(updated.updated_at).toBeGreaterThan(created.updated_at);
  });

  it('should throw when list not found', async () => {
    const env = getTestEnv();
    const { updateContactList } = await import('../routes/contact-lists');

    await expect(
      updateContactList(env, 'non-existent', { name: 'Test' })
    ).rejects.toThrow('Contact list not found');
  });
});

describe('deleteContactList', () => {
  it('should delete contact list', async () => {
    const env = getTestEnv();
    const { createContactList, deleteContactList, getContactLists } = await import('../routes/contact-lists');

    const created = await createContactList(env, { name: 'To Delete' });

    await deleteContactList(env, created.id);

    const lists = await getContactLists(env);
    expect(lists).toEqual([]);
  });
});
```

**Step 8: Implement updateContactList and deleteContactList**

```typescript
/**
 * Update contact list (internal, for testing)
 */
export async function updateContactList(
  env: Env,
  id: string,
  input: UpdateContactListRequest
): Promise<ContactList> {
  const existing = await env.DB.prepare(
    'SELECT * FROM contact_lists WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    throw new Error('Contact list not found');
  }

  const now = Math.floor(Date.now() / 1000);
  const updates: string[] = [];
  const bindings: any[] = [];

  if (input.name !== undefined) {
    if (!input.name.trim()) {
      throw new Error('Name cannot be empty');
    }
    updates.push('name = ?');
    bindings.push(input.name.trim());
  }

  if (input.description !== undefined) {
    updates.push('description = ?');
    bindings.push(input.description || null);
  }

  updates.push('updated_at = ?');
  bindings.push(now);
  bindings.push(id);

  await env.DB.prepare(
    `UPDATE contact_lists SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists WHERE id = ?'
  ).bind(id).first();

  return result as ContactList;
}

/**
 * Delete contact list (internal, for testing)
 */
export async function deleteContactList(env: Env, id: string): Promise<void> {
  const result = await env.DB.prepare(
    'DELETE FROM contact_lists WHERE id = ?'
  ).bind(id).run();

  if (!result.meta.changes) {
    throw new Error('Contact list not found');
  }
}
```

**Step 9: Add HTTP handlers**

```typescript
/**
 * GET /api/contact-lists
 */
export async function handleGetContactLists(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const lists = await getContactLists(env);
    return successResponse({ lists });
  } catch (error) {
    console.error('Get contact lists error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/contact-lists
 */
export async function handleCreateContactList(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await request.json<CreateContactListRequest>();
    const list = await createContactList(env, input);

    return jsonResponse({ success: true, data: list }, 201);
  } catch (error) {
    console.error('Create contact list error:', error);

    if (error instanceof Error && error.message === 'Name is required') {
      return errorResponse(error.message, 400);
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * PUT /api/contact-lists/:id
 */
export async function handleUpdateContactList(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await request.json<UpdateContactListRequest>();
    const list = await updateContactList(env, id, input);

    return successResponse({ list });
  } catch (error) {
    console.error('Update contact list error:', error);

    if (error instanceof Error) {
      if (error.message === 'Contact list not found') {
        return errorResponse(error.message, 404);
      }
      if (error.message.includes('cannot be empty')) {
        return errorResponse(error.message, 400);
      }
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/contact-lists/:id
 */
export async function handleDeleteContactList(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    await deleteContactList(env, id);
    return successResponse({ message: 'Contact list deleted successfully' });
  } catch (error) {
    console.error('Delete contact list error:', error);

    if (error instanceof Error && error.message === 'Contact list not found') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}
```

**Step 10: Run all tests**

Run: `cd workers/newsletter && npm test src/__tests__/contact-lists.test.ts`
Expected: All tests PASS

**Step 11: Commit**

```bash
git add workers/newsletter/src/routes/contact-lists.ts workers/newsletter/src/__tests__/contact-lists.test.ts
git commit -m "feat(api): add Contact List CRUD API

- Implement createContactList, getContactLists, updateContactList, deleteContactList
- Add HTTP handlers for /api/contact-lists endpoints
- Add comprehensive test coverage"
```

---

## Task 4: Member Management API (List Perspective)

**Files:**
- Modify: `workers/newsletter/src/routes/contact-lists.ts`
- Modify: `workers/newsletter/src/__tests__/contact-lists.test.ts`

**Step 1: Write test for adding members**

```typescript
describe('Member Management', () => {
  describe('addMembers', () => {
    it('should add subscribers to list', async () => {
      const env = getTestEnv();
      const { createContactList, addMembers, getListMembers } = await import('../routes/contact-lists');

      // Create list
      const list = await createContactList(env, { name: 'Test List' });

      // Create subscribers
      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?), (?, ?, ?)'
      ).bind('sub1', 'user1@example.com', 'active', 'sub2', 'user2@example.com', 'active').run();

      // Add members
      await addMembers(env, list.id, { subscriber_ids: ['sub1', 'sub2'] });

      // Verify
      const members = await getListMembers(env, list.id);
      expect(members.length).toBe(2);
      expect(members.map(m => m.subscriber_id)).toEqual(expect.arrayContaining(['sub1', 'sub2']));
    });
  });
});
```

**Step 2: Implement addMembers and getListMembers**

```typescript
/**
 * Add members to contact list (internal, for testing)
 */
export async function addMembers(
  env: Env,
  listId: string,
  input: AddMembersRequest
): Promise<void> {
  if (!input.subscriber_ids || input.subscriber_ids.length === 0) {
    throw new Error('At least one subscriber ID is required');
  }

  // Verify list exists
  const list = await env.DB.prepare(
    'SELECT id FROM contact_lists WHERE id = ?'
  ).bind(listId).first();

  if (!list) {
    throw new Error('Contact list not found');
  }

  // Add members (INSERT OR IGNORE for idempotency)
  for (const subscriberId of input.subscriber_ids) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id)
       VALUES (?, ?, ?)`
    ).bind(id, listId, subscriberId).run();
  }
}

/**
 * Get list members (internal, for testing)
 */
export async function getListMembers(env: Env, listId: string): Promise<ContactListMember[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM contact_list_members WHERE contact_list_id = ?'
  ).bind(listId).all();

  return result.results as ContactListMember[];
}

/**
 * Remove member from list (internal, for testing)
 */
export async function removeMember(
  env: Env,
  listId: string,
  subscriberId: string
): Promise<void> {
  const result = await env.DB.prepare(
    'DELETE FROM contact_list_members WHERE contact_list_id = ? AND subscriber_id = ?'
  ).bind(listId, subscriberId).run();

  if (!result.meta.changes) {
    throw new Error('Member not found in list');
  }
}
```

**Step 3: Add HTTP handlers**

```typescript
/**
 * GET /api/contact-lists/:listId/members
 */
export async function handleGetListMembers(
  request: Request,
  env: Env,
  listId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // Get members with subscriber details
    const result = await env.DB.prepare(
      `SELECT s.*, clm.added_at
       FROM contact_list_members clm
       JOIN subscribers s ON clm.subscriber_id = s.id
       WHERE clm.contact_list_id = ?
       ORDER BY s.email`
    ).bind(listId).all();

    return successResponse({ members: result.results });
  } catch (error) {
    console.error('Get list members error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/contact-lists/:listId/members
 */
export async function handleAddMembers(
  request: Request,
  env: Env,
  listId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await request.json<AddMembersRequest>();
    await addMembers(env, listId, input);

    return successResponse({ message: 'Members added successfully' });
  } catch (error) {
    console.error('Add members error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Contact list not found') || error.message.includes('required')) {
        return errorResponse(error.message, 400);
      }
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/contact-lists/:listId/members/:subscriberId
 */
export async function handleRemoveMember(
  request: Request,
  env: Env,
  listId: string,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    await removeMember(env, listId, subscriberId);
    return successResponse({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);

    if (error instanceof Error && error.message === 'Member not found in list') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/contact-lists.ts workers/newsletter/src/__tests__/contact-lists.test.ts
git commit -m "feat(api): add member management API (list perspective)

- Implement addMembers, getListMembers, removeMember
- Add HTTP handlers for /api/contact-lists/:id/members endpoints"
```

---

## Task 5: Member Management API (Subscriber Perspective)

**Files:**
- Modify: `workers/newsletter/src/routes/contact-lists.ts`
- Modify: `workers/newsletter/src/__tests__/contact-lists.test.ts`

**Step 1: Write test for subscriber lists**

```typescript
describe('Subscriber Perspective', () => {
  it('should get subscriber lists', async () => {
    const env = getTestEnv();
    const { createContactList, addMembers, getSubscriberLists } = await import('../routes/contact-lists');

    // Create subscriber
    await env.DB.prepare(
      'INSERT INTO subscribers (id, email, status) VALUES (?, ?, ?)'
    ).bind('sub1', 'user@example.com', 'active').run();

    // Create lists
    const list1 = await createContactList(env, { name: 'List 1' });
    const list2 = await createContactList(env, { name: 'List 2' });

    // Add to lists
    await addMembers(env, list1.id, { subscriber_ids: ['sub1'] });
    await addMembers(env, list2.id, { subscriber_ids: ['sub1'] });

    // Get subscriber lists
    const lists = await getSubscriberLists(env, 'sub1');
    expect(lists.length).toBe(2);
  });
});
```

**Step 2: Implement getSubscriberLists**

```typescript
/**
 * Get subscriber's lists (internal, for testing)
 */
export async function getSubscriberLists(
  env: Env,
  subscriberId: string
): Promise<ContactList[]> {
  const result = await env.DB.prepare(
    `SELECT cl.*
     FROM contact_lists cl
     JOIN contact_list_members clm ON cl.id = clm.contact_list_id
     WHERE clm.subscriber_id = ?
     ORDER BY cl.name`
  ).bind(subscriberId).all();

  return result.results as ContactList[];
}

/**
 * Add subscriber to list (internal, for testing)
 */
export async function addSubscriberToList(
  env: Env,
  subscriberId: string,
  listId: string
): Promise<void> {
  // Verify list exists
  const list = await env.DB.prepare(
    'SELECT id FROM contact_lists WHERE id = ?'
  ).bind(listId).first();

  if (!list) {
    throw new Error('Contact list not found');
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id)
     VALUES (?, ?, ?)`
  ).bind(id, listId, subscriberId).run();
}

/**
 * Remove subscriber from list (internal, for testing)
 */
export async function removeSubscriberFromList(
  env: Env,
  subscriberId: string,
  listId: string
): Promise<void> {
  const result = await env.DB.prepare(
    'DELETE FROM contact_list_members WHERE subscriber_id = ? AND contact_list_id = ?'
  ).bind(subscriberId, listId).run();

  if (!result.meta.changes) {
    throw new Error('Subscriber not in list');
  }
}
```

**Step 3: Add HTTP handlers**

```typescript
/**
 * GET /api/subscribers/:subscriberId/lists
 */
export async function handleGetSubscriberLists(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const lists = await getSubscriberLists(env, subscriberId);
    return successResponse({ lists });
  } catch (error) {
    console.error('Get subscriber lists error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/subscribers/:subscriberId/lists
 */
export async function handleAddSubscriberToList(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const { list_id } = await request.json<{ list_id: string }>();

    if (!list_id) {
      return errorResponse('list_id is required', 400);
    }

    await addSubscriberToList(env, subscriberId, list_id);
    return successResponse({ message: 'Subscriber added to list' });
  } catch (error) {
    console.error('Add subscriber to list error:', error);

    if (error instanceof Error && error.message === 'Contact list not found') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/subscribers/:subscriberId/lists/:listId
 */
export async function handleRemoveSubscriberFromList(
  request: Request,
  env: Env,
  subscriberId: string,
  listId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    await removeSubscriberFromList(env, subscriberId, listId);
    return successResponse({ message: 'Subscriber removed from list' });
  } catch (error) {
    console.error('Remove subscriber from list error:', error);

    if (error instanceof Error && error.message === 'Subscriber not in list') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/contact-lists.ts workers/newsletter/src/__tests__/contact-lists.test.ts
git commit -m "feat(api): add member management API (subscriber perspective)

- Implement getSubscriberLists, addSubscriberToList, removeSubscriberFromList
- Add HTTP handlers for /api/subscribers/:id/lists endpoints"
```

---

## Task 6: Update Route Registration

**Files:**
- Modify: `workers/newsletter/src/index.ts`

**Step 1: Import contact-lists handlers**

Add to imports section:

```typescript
import {
  handleGetContactLists,
  handleCreateContactList,
  handleUpdateContactList,
  handleDeleteContactList,
  handleGetListMembers,
  handleAddMembers,
  handleRemoveMember,
  handleGetSubscriberLists,
  handleAddSubscriberToList,
  handleRemoveSubscriberFromList,
} from './routes/contact-lists';
```

**Step 2: Add route matching**

Add before "Newsletter routes" section:

```typescript
// Contact Lists routes (Batch 4C)
if (path === '/api/contact-lists' && request.method === 'GET') {
  response = await handleGetContactLists(request, env);
} else if (path === '/api/contact-lists' && request.method === 'POST') {
  response = await handleCreateContactList(request, env);
} else if (path.match(/^\/api\/contact-lists\/[^\/]+\/members$/)) {
  const listId = path.replace('/api/contact-lists/', '').replace('/members', '');

  if (request.method === 'GET') {
    response = await handleGetListMembers(request, env, listId);
  } else if (request.method === 'POST') {
    response = await handleAddMembers(request, env, listId);
  }
} else if (path.match(/^\/api\/contact-lists\/[^\/]+\/members\/[^\/]+$/)) {
  const parts = path.replace('/api/contact-lists/', '').split('/');
  const listId = parts[0];
  const subscriberId = parts[2];

  if (request.method === 'DELETE') {
    response = await handleRemoveMember(request, env, listId, subscriberId);
  }
} else if (path.match(/^\/api\/contact-lists\/[^\/]+$/) && request.method === 'PUT') {
  const id = path.replace('/api/contact-lists/', '');
  response = await handleUpdateContactList(request, env, id);
} else if (path.match(/^\/api\/contact-lists\/[^\/]+$/) && request.method === 'DELETE') {
  const id = path.replace('/api/contact-lists/', '');
  response = await handleDeleteContactList(request, env, id);
} else if (path.match(/^\/api\/subscribers\/[^\/]+\/lists$/)) {
  const subscriberId = path.replace('/api/subscribers/', '').replace('/lists', '');

  if (request.method === 'GET') {
    response = await handleGetSubscriberLists(request, env, subscriberId);
  } else if (request.method === 'POST') {
    response = await handleAddSubscriberToList(request, env, subscriberId);
  }
} else if (path.match(/^\/api\/subscribers\/[^\/]+\/lists\/[^\/]+$/)) {
  const parts = path.replace('/api/subscribers/', '').split('/');
  const subscriberId = parts[0];
  const listId = parts[2];

  if (request.method === 'DELETE') {
    response = await handleRemoveSubscriberFromList(request, env, subscriberId, listId);
  }
}
```

**Step 3: Test routes**

Run: `cd workers/newsletter && npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add workers/newsletter/src/index.ts
git commit -m "feat(routes): register Contact List API routes"
```

---

## Task 7: Campaign Send Logic Update

**Files:**
- Modify: `workers/newsletter/src/routes/campaign-send.ts`
- Modify: `workers/newsletter/src/__tests__/campaign-send.test.ts`

**Step 1: Write failing test for list-based delivery**

```typescript
describe('List-based Campaign Delivery', () => {
  it('should send to list members only when contact_list_id is set', async () => {
    const env = getTestEnv();
    const { createContactList, addMembers } = await import('../routes/contact-lists');

    // Create 3 subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status) VALUES
      ('sub1', 'list-member@example.com', 'active'),
      ('sub2', 'other-subscriber@example.com', 'active'),
      ('sub3', 'another-subscriber@example.com', 'active')
    `).run();

    // Create list with 1 member
    const list = await createContactList(env, { name: 'Tech Readers' });
    await addMembers(env, list.id, { subscriber_ids: ['sub1'] });

    // Create campaign with contact_list_id
    const campaign = await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status, contact_list_id)
       VALUES (?, ?, ?, ?, ?)`
    ).bind('camp1', 'Test', 'Content', 'draft', list.id).run();

    // Send campaign
    const result = await sendCampaign(
      new Request('http://localhost/api/campaigns/camp1/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      }),
      env,
      'camp1'
    );

    const data = await result.json();

    // Should send to 1 subscriber only (list member)
    expect(data.data.recipient_count).toBe(1);
  });

  it('should send to all active subscribers when contact_list_id is NULL', async () => {
    const env = getTestEnv();

    // Create 2 active subscribers
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status) VALUES
      ('sub1', 'user1@example.com', 'active'),
      ('sub2', 'user2@example.com', 'active')
    `).run();

    // Create campaign without contact_list_id
    await env.DB.prepare(
      `INSERT INTO campaigns (id, subject, content, status)
       VALUES (?, ?, ?, ?)`
    ).bind('camp2', 'Test', 'Content', 'draft').run();

    // Send campaign
    const result = await sendCampaign(
      new Request('http://localhost/api/campaigns/camp2/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      }),
      env,
      'camp2'
    );

    const data = await result.json();

    // Should send to all active subscribers
    expect(data.data.recipient_count).toBe(2);
  });
});
```

**Step 2: Update sendCampaign logic**

Find the subscriber selection logic (around line 72-74) and replace:

```typescript
// OLD:
const subscribersResult = await env.DB.prepare(
  "SELECT * FROM subscribers WHERE status = 'active'"
).all<Subscriber>();

// NEW:
let subscribersResult;

if (campaign.contact_list_id) {
  // List-based delivery: send to list members only
  subscribersResult = await env.DB.prepare(
    `SELECT s.* FROM subscribers s
     JOIN contact_list_members clm ON s.id = clm.subscriber_id
     WHERE clm.contact_list_id = ? AND s.status = 'active'`
  ).bind(campaign.contact_list_id).all<Subscriber>();
} else {
  // Broadcast delivery: send to all active subscribers
  subscribersResult = await env.DB.prepare(
    "SELECT * FROM subscribers WHERE status = 'active'"
  ).all<Subscriber>();
}
```

**Step 3: Run tests**

Run: `cd workers/newsletter && npm test src/__tests__/campaign-send.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/campaign-send.ts workers/newsletter/src/__tests__/campaign-send.test.ts
git commit -m "feat(campaign): add list-based delivery support

- Update sendCampaign to check campaign.contact_list_id
- If set: send to list members only (JOIN query)
- If NULL: send to all active subscribers (existing behavior)
- Add test coverage for both scenarios"
```

---

## Task 8: Signup Page Integration

**Files:**
- Modify: `workers/newsletter/src/routes/subscribe.ts`
- Modify: `workers/newsletter/src/__tests__/subscribe.test.ts`

**Step 1: Write test for contact list auto-assignment**

```typescript
describe('Contact List Auto-Assignment', () => {
  it('should add subscriber to contact list when signup page has contact_list_id', async () => {
    const env = getTestEnv();
    const { createContactList } = await import('../routes/contact-lists');
    const { createSignupPage } = await import('../routes/signup-pages');

    // Create contact list
    const list = await createContactList(env, { name: 'Tech Blog Readers' });

    // Create signup page with contact_list_id
    const page = await createSignupPage(env, {
      slug: 'tech-newsletter',
      title: 'Tech Newsletter',
      content: 'Subscribe to tech updates',
      contact_list_id: list.id,
    });

    // Subscribe via this page
    const response = await handleSubscribe(
      new Request('http://localhost/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          signupPageSlug: 'tech-newsletter',
          turnstileToken: 'test-token',
        }),
      }),
      env
    );

    // Confirm subscription
    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE email = 'test@example.com'"
    ).first();

    await handleConfirm(
      new Request(`http://localhost/api/newsletter/confirm/${subscriber.confirm_token}`),
      env,
      subscriber.confirm_token
    );

    // Verify subscriber was added to contact list
    const membership = await env.DB.prepare(
      'SELECT * FROM contact_list_members WHERE subscriber_id = ? AND contact_list_id = ?'
    ).bind(subscriber.id, list.id).first();

    expect(membership).toBeTruthy();
  });
});
```

**Step 2: Update confirm handler**

Find the confirmation completion section (where status is updated to 'active') and add:

```typescript
// After sequence enrollment (around line 90-100), add:

// Contact List auto-assignment (Batch 4C)
if (signupPage?.contact_list_id) {
  const memberId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id)
     VALUES (?, ?, ?)`
  ).bind(memberId, signupPage.contact_list_id, subscriber.id).run();
}
```

**Step 3: Run tests**

Run: `cd workers/newsletter && npm test src/__tests__/subscribe.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/subscribe.ts workers/newsletter/src/__tests__/subscribe.test.ts
git commit -m "feat(signup): add contact list auto-assignment

- Add subscriber to contact list when signup page has contact_list_id
- Uses INSERT OR IGNORE for idempotency
- Works alongside sequence enrollment"
```

---

## Task 9: Frontend API Client

**Files:**
- Modify: `src/utils/admin-api.ts`

**Step 1: Add Contact List types**

```typescript
export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateContactListData {
  name: string;
  description?: string;
}

export interface UpdateContactListData {
  name?: string;
  description?: string;
}
```

**Step 2: Add Contact List API functions**

```typescript
// Contact Lists
export async function getContactLists() {
  return apiRequest<{ lists: ContactList[] }>('/contact-lists');
}

export async function getContactList(id: string) {
  return apiRequest<{ list: ContactList }>(`/contact-lists/${id}`);
}

export async function createContactList(data: CreateContactListData) {
  return apiRequest<ContactList>('/contact-lists', { method: 'POST', body: data });
}

export async function updateContactList(id: string, data: UpdateContactListData) {
  return apiRequest<{ list: ContactList }>(`/contact-lists/${id}`, { method: 'PUT', body: data });
}

export async function deleteContactList(id: string) {
  return apiRequest<{ message: string }>(`/contact-lists/${id}`, { method: 'DELETE' });
}

// Contact List Members
export async function getListMembers(listId: string) {
  return apiRequest(`/contact-lists/${listId}/members`);
}

export async function addMembersToList(listId: string, subscriberIds: string[]) {
  return apiRequest(`/contact-lists/${listId}/members`, {
    method: 'POST',
    body: { subscriber_ids: subscriberIds },
  });
}

export async function removeMemberFromList(listId: string, subscriberId: string) {
  return apiRequest(`/contact-lists/${listId}/members/${subscriberId}`, { method: 'DELETE' });
}

// Subscriber Lists
export async function getSubscriberLists(subscriberId: string) {
  return apiRequest<{ lists: ContactList[] }>(`/subscribers/${subscriberId}/lists`);
}

export async function addSubscriberToList(subscriberId: string, listId: string) {
  return apiRequest(`/subscribers/${subscriberId}/lists`, {
    method: 'POST',
    body: { list_id: listId },
  });
}

export async function removeSubscriberFromList(subscriberId: string, listId: string) {
  return apiRequest(`/subscribers/${subscriberId}/lists/${listId}`, { method: 'DELETE' });
}
```

**Step 3: Update Campaign and SignupPage API calls**

Update `createCampaign` and `updateCampaign`:

```typescript
export async function createCampaign(data: {
  subject: string;
  content: string;
  scheduled_at?: number;
  contact_list_id?: string; // ADD THIS
}) {
  return apiRequest('/campaigns', { method: 'POST', body: data });
}

export async function updateCampaign(id: string, data: {
  subject?: string;
  content?: string;
  status?: string;
  contact_list_id?: string; // ADD THIS
}) {
  return apiRequest(`/campaigns/${id}`, { method: 'PUT', body: data });
}
```

Update `createSignupPage` and `updateSignupPage`:

```typescript
// Update CreateSignupPageData interface
export interface CreateSignupPageData {
  slug: string;
  sequence_id?: string;
  contact_list_id?: string; // ADD THIS
  title: string;
  content: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}

// Update UpdateSignupPageData interface
export interface UpdateSignupPageData {
  slug?: string;
  sequence_id?: string;
  contact_list_id?: string; // ADD THIS
  title?: string;
  content?: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}
```

**Step 4: Commit**

```bash
git add src/utils/admin-api.ts
git commit -m "feat(frontend): add Contact List API client functions

- Add getContactLists, createContactList, updateContactList, deleteContactList
- Add member management functions (both list and subscriber perspectives)
- Update Campaign and SignupPage types to include contact_list_id"
```

---

## Task 10: UI Components - Part 1 (ListSelector & Modal)

**Files:**
- Create: `src/components/admin/ListSelector.tsx`
- Create: `src/components/admin/ContactListFormModal.tsx`

**Step 1: Implement ListSelector component**

Create `src/components/admin/ListSelector.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getContactLists, type ContactList } from '../../utils/admin-api';

interface Props {
  value: string | null;
  onChange: (listId: string | null) => void;
  label?: string;
  allowNull?: boolean;
}

export function ListSelector({ value, onChange, label = 'Contact List', allowNull = true }: Props) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    setLoading(true);
    try {
      const result = await getContactLists();
      if (result.success && result.data) {
        setLists(result.data.lists);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading lists...</div>;
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
      >
        {allowNull && <option value="">全員配信（リスト未選択）</option>}
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

**Step 2: Implement ContactListFormModal component**

Create `src/components/admin/ContactListFormModal.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createContactList, updateContactList, type ContactList } from '../../utils/admin-api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  list?: ContactList | null;
}

export function ContactListFormModal({ isOpen, onClose, onSuccess, list }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description || '');
    } else {
      setName('');
      setDescription('');
    }
    setError(null);
  }, [list, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data = { name, description: description || undefined };

      const result = list
        ? await updateContactList(list.id, data)
        : await createContactList(data);

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to save list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save list');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {list ? 'リストを編集' : '新しいリストを作成'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              リスト名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              placeholder="例: Tech Blog Readers"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              rows={3}
              placeholder="このリストの用途を説明"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? '保存中...' : list ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/admin/ListSelector.tsx src/components/admin/ContactListFormModal.tsx
git commit -m "feat(ui): add ListSelector and ContactListFormModal components

- ListSelector: dropdown for selecting contact lists (with 'all subscribers' option)
- ContactListFormModal: modal for creating/editing contact lists"
```

---

## Task 11: UI Components - Part 2 (ContactListList & ContactListDetail)

**Files:**
- Create: `src/components/admin/ContactListList.tsx`
- Create: `src/components/admin/ContactListDetail.tsx`
- Create: `src/pages/admin/contact-lists/index.astro`
- Create: `src/pages/admin/contact-lists/detail.astro`

**Step 1: Implement ContactListList component**

Create `src/components/admin/ContactListList.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getContactLists, deleteContactList, type ContactList } from '../../utils/admin-api';
import { ContactListFormModal } from './ContactListFormModal';
import { ConfirmModal } from './ConfirmModal';

export function ContactListList() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    setLoading(true);
    setError(null);

    try {
      const result = await getContactLists();
      if (result.success && result.data) {
        setLists(result.data.lists);
      } else {
        setError(result.error || 'Failed to load lists');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateNew() {
    setEditingList(null);
    setFormModalOpen(true);
  }

  function handleEdit(list: ContactList) {
    setEditingList(list);
    setFormModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await deleteContactList(deleteTarget.id);
      if (result.success) {
        setLists(lists.filter((l) => l.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setError(result.error || 'Failed to delete list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadLists}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contact Lists</h1>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
        >
          + 新規作成
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">Contact List がありません</p>
          <button
            onClick={handleCreateNew}
            className="text-gray-800 underline hover:no-underline"
          >
            最初のリストを作成
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{list.name}</h3>
                  {list.description && (
                    <p className="text-gray-600 mb-2">{list.description}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    作成日: {new Date(list.created_at * 1000).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/admin/contact-lists/detail?id=${list.id}`}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    詳細
                  </a>
                  <button
                    onClick={() => handleEdit(list)}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setDeleteTarget(list)}
                    className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ContactListFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingList(null);
        }}
        onSuccess={loadLists}
        list={editingList}
      />

      {deleteTarget && (
        <ConfirmModal
          isOpen={!!deleteTarget}
          title="リストを削除"
          message={`「${deleteTarget.name}」を削除しますか？購読者自体は削除されません。`}
          confirmText="削除"
          cancelText="キャンセル"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          danger
        />
      )}
    </div>
  );
}
```

**Step 2: Create contact-lists index page**

Create `src/pages/admin/contact-lists/index.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { ContactListList } from '../../../components/admin/ContactListList';
---

<AdminLayout>
  <ContactListList client:load />
</AdminLayout>
```

**Step 3: Commit**

```bash
git add src/components/admin/ContactListList.tsx src/pages/admin/contact-lists/index.astro
git commit -m "feat(ui): add Contact Lists page

- ContactListList component with CRUD operations
- Create/edit via modal
- Delete with confirmation
- Link to detail page"
```

**Step 4: Implement ContactListDetail (simplified for brevity)**

Create `src/components/admin/ContactListDetail.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getContactList, getListMembers, removeMemberFromList, type ContactList } from '../../utils/admin-api';

interface Props {
  listId: string;
}

export function ContactListDetail({ listId }: Props) {
  const [list, setList] = useState<ContactList | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [listId]);

  async function loadData() {
    setLoading(true);
    const [listResult, membersResult] = await Promise.all([
      getContactList(listId),
      getListMembers(listId),
    ]);

    if (listResult.success && listResult.data) {
      setList(listResult.data.list);
    }

    if (membersResult.success && membersResult.data) {
      setMembers(membersResult.data.members);
    }

    setLoading(false);
  }

  async function handleRemoveMember(subscriberId: string) {
    const result = await removeMemberFromList(listId, subscriberId);
    if (result.success) {
      setMembers(members.filter((m) => m.id !== subscriberId));
    }
  }

  if (loading || !list) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{list.name}</h1>
      {list.description && <p className="text-gray-600 mb-6">{list.description}</p>}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">メンバー ({members.length})</h2>

        {members.length === 0 ? (
          <p className="text-gray-500">メンバーがいません</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b">
                  <td className="py-2">{member.email}</td>
                  <td className="py-2">{member.name || '-'}</td>
                  <td className="py-2">{member.status}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

Create `src/pages/admin/contact-lists/detail.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { ContactListDetail } from '../../../components/admin/ContactListDetail';

const { searchParams } = Astro.url;
const listId = searchParams.get('id');

if (!listId) {
  return Astro.redirect('/admin/contact-lists');
}
---

<AdminLayout>
  <ContactListDetail listId={listId} client:load />
</AdminLayout>
```

**Step 5: Commit**

```bash
git add src/components/admin/ContactListDetail.tsx src/pages/admin/contact-lists/detail.astro
git commit -m "feat(ui): add Contact List detail page

- Display list metadata
- Show member list with email/name/status
- Remove member action"
```

---

## Task 12: Integration with Existing Forms

**Files:**
- Modify: `src/components/admin/CampaignForm.tsx`
- Modify: `src/components/admin/SignupPageEditForm.tsx`

**Step 1: Add ListSelector to CampaignForm**

Find the CampaignForm component and add contact_list_id field:

```typescript
// Add to state
const [contactListId, setContactListId] = useState<string | null>(campaign?.contact_list_id || null);

// Add to form (after content field, before schedule section)
<ListSelector
  value={contactListId}
  onChange={setContactListId}
  label="配信対象リスト（オプション）"
  allowNull
/>

// Add to submit data
const data = {
  subject,
  content,
  contact_list_id: contactListId || undefined,
  // ... other fields
};
```

**Step 2: Add ListSelector to SignupPageEditForm**

Find SignupPageEditForm and add contact_list_id field:

```typescript
// Add to state
const [contactListId, setContactListId] = useState<string | null>(page?.contact_list_id || null);

// Add to form (after sequence selector)
<ListSelector
  value={contactListId}
  onChange={setContactListId}
  label="自動割り当てリスト（オプション）"
  allowNull
/>

// Add to submit data
const data = {
  // ... other fields
  sequence_id: sequenceId || undefined,
  contact_list_id: contactListId || undefined,
};
```

**Step 3: Commit**

```bash
git add src/components/admin/CampaignForm.tsx src/components/admin/SignupPageEditForm.tsx
git commit -m "feat(integration): add Contact List selector to Campaign and Signup Page forms

- CampaignForm: add contact_list_id selector (for targeted delivery)
- SignupPageEditForm: add contact_list_id selector (for auto-assignment)"
```

---

## Implementation Handoff

**Plan Complete:** All 12 tasks defined for Batch 4C implementation.

**Summary:**
- **Tasks 1-2:** Database schema + type definitions
- **Tasks 3-6:** Backend API (CRUD, member management, routing)
- **Tasks 7-8:** Business logic integration (campaign delivery, signup)
- **Tasks 9:** Frontend API client
- **Tasks 10-12:** UI components and integration

**Total Estimated Time:** ~9.5 hours (per MVP estimate)

**Ready for Execution:**

使用許可をお願いします。実装を開始してよろしいですか？

Batch 4C の実装計画が完成しました。Task 1（Database Schema Changes）から順番に実装していきます。
