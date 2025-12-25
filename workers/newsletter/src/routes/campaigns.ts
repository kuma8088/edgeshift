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
    const { subject, content, scheduled_at, schedule_type, schedule_config, contact_list_id } = body;

    if (!subject || !content) {
      return errorResponse('Subject and content are required', 400);
    }

    const id = crypto.randomUUID();
    const status = scheduled_at ? 'scheduled' : 'draft';

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config, last_sent_at, sent_at, recipient_count, contact_list_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      contact_list_id || null
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

    return successResponse({ campaign });
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
      campaigns: campaigns.results || [],
      total: total?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('List campaigns error:', error);
    return errorResponse('Internal server error', 500);
  }
}

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
    if (body.contact_list_id !== undefined) {
      updates.push('contact_list_id = ?');
      bindings.push(body.contact_list_id || null);
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

    return successResponse(updated);
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
    // Check if campaign exists
    const existing = await env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ?'
    ).bind(id).first<Campaign>();

    if (!existing) {
      return errorResponse('Campaign not found', 404);
    }

    if (existing.status === 'sent') {
      return errorResponse('Cannot delete sent campaign', 400);
    }

    await env.DB.prepare(
      'DELETE FROM campaigns WHERE id = ?'
    ).bind(id).run();

    return successResponse({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}
