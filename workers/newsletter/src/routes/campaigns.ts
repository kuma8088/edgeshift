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
