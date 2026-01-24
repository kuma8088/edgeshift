import type { Env, ContactList, CreateContactListRequest, UpdateContactListRequest, ContactListMember, AddMembersRequest } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { jsonResponse, errorResponse, successResponse } from '../lib/response';

/**
 * Create contact list
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
    `INSERT INTO contact_lists (id, name, description, resend_segment_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.name.trim(),
    input.description || null,
    input.resend_segment_id || null,
    now,
    now
  ).run();

  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists WHERE id = ?'
  ).bind(id).first();

  return result as ContactList;
}

/**
 * Get single contact list by ID
 */
export async function getContactList(env: Env, id: string): Promise<ContactList> {
  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    throw new Error('Contact list not found');
  }

  return result as ContactList;
}

/**
 * Get all contact lists
 */
export async function getContactLists(env: Env): Promise<ContactList[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM contact_lists ORDER BY name'
  ).all();

  return result.results as ContactList[];
}

/**
 * Update contact list
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
 * Delete contact list
 */
export async function deleteContactList(env: Env, id: string): Promise<void> {
  const result = await env.DB.prepare(
    'DELETE FROM contact_lists WHERE id = ?'
  ).bind(id).run();

  if (!result.meta.changes) {
    throw new Error('Contact list not found');
  }
}

/**
 * GET /api/contact-lists/:id (single list)
 */
export async function handleGetContactList(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const list = await getContactList(env, id);
    return successResponse({ list });
  } catch (error) {
    console.error('Get contact list error:', error);

    if (error instanceof Error && error.message === 'Contact list not found') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /api/contact-lists
 */
export async function handleGetContactLists(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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

// ============================================================
// Task 4: Member Management API (List Perspective)
// ============================================================

/**
 * Add members to list
 */
export async function addMembers(
  env: Env,
  listId: string,
  input: AddMembersRequest
): Promise<void> {
  if (!input.subscriber_ids || input.subscriber_ids.length === 0) {
    throw new Error('At least one subscriber ID is required');
  }

  const list = await env.DB.prepare(
    'SELECT id FROM contact_lists WHERE id = ?'
  ).bind(listId).first();

  if (!list) {
    throw new Error('Contact list not found');
  }

  const now = Math.floor(Date.now() / 1000);

  for (const subscriberId of input.subscriber_ids) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id, added_at)
       VALUES (?, ?, ?, ?)`
    ).bind(id, listId, subscriberId, now).run();
  }
}

/**
 * Get list members
 */
export async function getListMembers(env: Env, listId: string): Promise<ContactListMember[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM contact_list_members WHERE contact_list_id = ?'
  ).bind(listId).all();

  return result.results as ContactListMember[];
}

/**
 * Remove member from list
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

/**
 * GET /api/contact-lists/:listId/members
 */
export async function handleGetListMembers(
  request: Request,
  env: Env,
  listId: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const result = await env.DB.prepare(
      `SELECT s.id AS subscriber_id, s.email, s.name, s.status, s.created_at, s.subscribed_at, s.unsubscribed_at, clm.added_at
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
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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

// ============================================================
// Task 5: Member Management API (Subscriber Perspective)
// ============================================================

/**
 * Get subscriber's lists
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
 * Add subscriber to list
 */
export async function addSubscriberToList(
  env: Env,
  subscriberId: string,
  listId: string
): Promise<void> {
  const list = await env.DB.prepare(
    'SELECT id FROM contact_lists WHERE id = ?'
  ).bind(listId).first();

  if (!list) {
    throw new Error('Contact list not found');
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO contact_list_members (id, contact_list_id, subscriber_id, added_at)
     VALUES (?, ?, ?, ?)`
  ).bind(id, listId, subscriberId, now).run();
}

/**
 * Remove subscriber from list
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

/**
 * GET /api/subscribers/:subscriberId/lists
 */
export async function handleGetSubscriberLists(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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
  if (!(await isAuthorizedAsync(request, env))) {
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
