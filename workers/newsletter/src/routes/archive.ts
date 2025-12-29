import type { Env, Campaign, ApiResponse } from '../types';
import { errorResponse, successResponse } from '../lib/response';

/**
 * GET /api/archive
 * Returns paginated list of published (sent) campaigns.
 * Public endpoint - no authentication required.
 */
export async function getArchiveList(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Query only sent (published) campaigns
    const query = `
      SELECT * FROM campaigns
      WHERE status = 'sent'
      ORDER BY sent_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count FROM campaigns
      WHERE status = 'sent'
    `;

    const campaigns = await env.DB.prepare(query)
      .bind(limit, offset)
      .all<Campaign>();

    const total = await env.DB.prepare(countQuery)
      .first<{ count: number }>();

    return successResponse({
      articles: campaigns.results || [],
      total: total?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get archive list error:', error);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /api/archive/:slug
 * Returns a single campaign article by slug.
 * Public endpoint - no authentication required.
 * Only returns published (sent) campaigns.
 */
export async function getArchiveArticle(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  try {
    const campaign = await env.DB.prepare(`
      SELECT * FROM campaigns
      WHERE slug = ? AND status = 'sent'
    `).bind(slug).first<Campaign>();

    if (!campaign) {
      return errorResponse('Article not found', 404);
    }

    return successResponse({ article: campaign });
  } catch (error) {
    console.error('Get archive article error:', error);
    return errorResponse('Internal server error', 500);
  }
}
