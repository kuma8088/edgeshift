import type { Env, ContactList, CreateContactListRequest, UpdateContactListRequest } from '../types';
import { isAuthorized } from '../lib/auth';
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
