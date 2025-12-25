/**
 * Signup Pages API Handlers (Batch 4A)
 *
 * CRUD operations for signup pages:
 * - GET /api/signup-pages - List all active pages
 * - GET /api/signup-pages/:id - Get page by ID
 * - GET /api/signup-pages/by-slug/:slug - Get page by slug (public)
 * - POST /api/signup-pages - Create new page
 * - PUT /api/signup-pages/:id - Update page
 * - DELETE /api/signup-pages/:id - Soft delete page
 */

import type { Env } from '../types';
import { isAuthorized } from '../lib/auth';
import { jsonResponse, errorResponse, successResponse } from '../lib/response';

// Validation constants
const SLUG_REGEX = /^[a-z0-9-]{3,50}$/;
const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

interface SignupPageInput {
  slug: string;
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  sequence_id?: string;
  contact_list_id?: string;
}

interface SignupPage extends SignupPageInput {
  id: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

// ========== Internal Functions (for testing) ==========

/**
 * Get all active signup pages (internal, for testing)
 */
export async function getSignupPagesList(env: Env): Promise<SignupPage[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE is_active = 1 ORDER BY slug'
  ).all();

  return result.results as SignupPage[];
}

/**
 * Get page by ID (internal, for testing)
 */
export async function getSignupPageById(env: Env, id: string): Promise<SignupPage | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE id = ? AND is_active = 1'
  )
    .bind(id)
    .first();

  return result as SignupPage | null;
}

/**
 * Get page by slug (internal, for testing)
 */
export async function getSignupPageBySlug(env: Env, slug: string): Promise<SignupPage | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE slug = ? AND is_active = 1'
  )
    .bind(slug)
    .first();

  return result as SignupPage | null;
}

/**
 * Create page (internal, for testing)
 */
export async function createSignupPage(env: Env, input: SignupPageInput): Promise<SignupPage> {
  // Validate required fields
  if (!input.slug || !input.title || !input.content) {
    throw new Error('Missing required fields: slug, title, content');
  }

  // Validate slug format
  if (!SLUG_REGEX.test(input.slug)) {
    throw new Error(
      'Invalid slug format. Must be lowercase alphanumeric with hyphens, 3-50 characters.'
    );
  }

  // Validate content size
  if (input.content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Content size exceeds maximum of ${MAX_CONTENT_SIZE} bytes`);
  }

  // Check for duplicate slug
  const existing = await env.DB.prepare(
    'SELECT id FROM signup_pages WHERE slug = ?'
  )
    .bind(input.slug)
    .first();

  if (existing) {
    throw new Error('Slug already exists');
  }

  // Validate sequence_id if provided
  if (input.sequence_id) {
    const sequence = await env.DB.prepare(
      'SELECT id FROM sequences WHERE id = ?'
    )
      .bind(input.sequence_id)
      .first();

    if (!sequence) {
      throw new Error('Sequence not found');
    }
  }

  // Generate ID
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Insert
  await env.DB.prepare(
    `INSERT INTO signup_pages (
      id, slug, title, content, meta_title, meta_description,
      sequence_id, contact_list_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      id,
      input.slug,
      input.title,
      input.content,
      input.meta_title || null,
      input.meta_description || null,
      input.sequence_id || null,
      input.contact_list_id || null,
      now,
      now
    )
    .run();

  // Return created page
  const created = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE id = ?'
  )
    .bind(id)
    .first();

  return created as SignupPage;
}

/**
 * Update page (internal, for testing)
 */
export async function updateSignupPage(
  env: Env,
  id: string,
  input: Partial<SignupPageInput>
): Promise<SignupPage> {
  // Check if page exists
  const existing = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE id = ? AND is_active = 1'
  )
    .bind(id)
    .first();

  if (!existing) {
    throw new Error('Signup page not found');
  }

  // Validate slug format if provided
  if (input.slug && !SLUG_REGEX.test(input.slug)) {
    throw new Error(
      'Invalid slug format. Must be lowercase alphanumeric with hyphens, 3-50 characters.'
    );
  }

  // Check for duplicate slug if slug is being changed
  if (input.slug && input.slug !== (existing as any).slug) {
    const duplicate = await env.DB.prepare(
      'SELECT id FROM signup_pages WHERE slug = ? AND id != ?'
    )
      .bind(input.slug, id)
      .first();

    if (duplicate) {
      throw new Error('Slug already exists');
    }
  }

  // Validate content size if provided
  if (input.content && input.content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Content size exceeds maximum of ${MAX_CONTENT_SIZE} bytes`);
  }

  // Validate sequence_id if provided
  if (input.sequence_id) {
    const sequence = await env.DB.prepare(
      'SELECT id FROM sequences WHERE id = ?'
    )
      .bind(input.sequence_id)
      .first();

    if (!sequence) {
      throw new Error('Sequence not found');
    }
  }

  const now = Math.floor(Date.now() / 1000);

  // Build update query
  const updates: string[] = [];
  const bindings: any[] = [];

  if (input.slug !== undefined) {
    updates.push('slug = ?');
    bindings.push(input.slug);
  }
  if (input.title !== undefined) {
    updates.push('title = ?');
    bindings.push(input.title);
  }
  if (input.content !== undefined) {
    updates.push('content = ?');
    bindings.push(input.content);
  }
  if (input.meta_title !== undefined) {
    updates.push('meta_title = ?');
    bindings.push(input.meta_title || null);
  }
  if (input.meta_description !== undefined) {
    updates.push('meta_description = ?');
    bindings.push(input.meta_description || null);
  }
  if (input.sequence_id !== undefined) {
    updates.push('sequence_id = ?');
    bindings.push(input.sequence_id || null);
  }
  if (input.contact_list_id !== undefined) {
    updates.push('contact_list_id = ?');
    bindings.push(input.contact_list_id || null);
  }

  updates.push('updated_at = ?');
  bindings.push(now);

  bindings.push(id);

  await env.DB.prepare(
    `UPDATE signup_pages SET ${updates.join(', ')} WHERE id = ?`
  )
    .bind(...bindings)
    .run();

  // Return updated page
  const updated = await env.DB.prepare(
    'SELECT * FROM signup_pages WHERE id = ?'
  )
    .bind(id)
    .first();

  return updated as SignupPage;
}

/**
 * Delete page (internal, for testing)
 */
export async function deleteSignupPage(env: Env, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const result = await env.DB.prepare(
    'UPDATE signup_pages SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1'
  )
    .bind(now, id)
    .run();

  if (!result.meta.changes) {
    throw new Error('Signup page not found');
  }
}

// ========== HTTP Handlers ==========

/**
 * GET /api/signup-pages
 */
export async function handleGetSignupPages(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const pages = await getSignupPagesList(env);
    return successResponse({ pages });
  } catch (error) {
    console.error('Get signup pages error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /api/signup-pages/:id
 */
export async function handleGetSignupPage(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const page = await getSignupPageById(env, id);

    if (!page) {
      return errorResponse('Signup page not found', 404);
    }

    return successResponse({ page });
  } catch (error) {
    console.error('Get signup page error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /api/signup-pages/by-slug/:slug (Public)
 */
export async function handleGetSignupPageBySlug(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  // Public endpoint - no auth required

  try {
    const page = await getSignupPageBySlug(env, slug);

    if (!page) {
      return errorResponse('Signup page not found', 404);
    }

    return successResponse({ page });
  } catch (error) {
    console.error('Get signup page by slug error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/signup-pages
 */
export async function handleCreateSignupPage(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await request.json<SignupPageInput>();
    const page = await createSignupPage(env, input);

    return jsonResponse({ success: true, data: page }, 201);
  } catch (error) {
    console.error('Create signup page error:', error);

    if (error instanceof Error) {
      if (
        error.message.includes('Invalid slug') ||
        error.message.includes('Missing required') ||
        error.message.includes('already exists') ||
        error.message.includes('Content size exceeds') ||
        error.message.includes('Sequence not found')
      ) {
        return errorResponse(error.message, 400);
      }
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * PUT /api/signup-pages/:id
 */
export async function handleUpdateSignupPage(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await request.json<Partial<SignupPageInput>>();
    const page = await updateSignupPage(env, id, input);

    return successResponse({ page });
  } catch (error) {
    console.error('Update signup page error:', error);

    if (error instanceof Error) {
      if (error.message === 'Signup page not found') {
        return errorResponse(error.message, 404);
      }
      if (
        error.message.includes('Invalid slug') ||
        error.message.includes('already exists') ||
        error.message.includes('Content size exceeds') ||
        error.message.includes('Sequence not found')
      ) {
        return errorResponse(error.message, 400);
      }
    }

    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/signup-pages/:id
 */
export async function handleDeleteSignupPage(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    await deleteSignupPage(env, id);
    return successResponse({ message: 'Signup page deleted successfully' });
  } catch (error) {
    console.error('Delete signup page error:', error);

    if (error instanceof Error && error.message === 'Signup page not found') {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Internal server error', 500);
  }
}
