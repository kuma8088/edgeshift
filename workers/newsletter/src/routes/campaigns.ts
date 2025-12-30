import type { Env, Campaign, CreateCampaignRequest, UpdateCampaignRequest, ApiResponse, AbVariantStats, AbTestStats } from '../types';
import { isAuthorized } from '../lib/auth';
import { jsonResponse, errorResponse, successResponse } from '../lib/response';
import { generateSlug } from '../lib/slug';
import { generateExcerpt } from '../lib/excerpt';
import { calculateAbScore, determineWinner } from '../utils/ab-testing';

/**
 * Get A/B test statistics for a campaign
 * @param db - D1 database instance
 * @param campaignId - Campaign ID
 * @param campaignAbWinner - The ab_winner field from campaign (if already determined)
 */
async function getAbStats(db: D1Database, campaignId: string, campaignAbWinner?: 'A' | 'B' | null): Promise<AbTestStats | null> {
  const results = await db
    .prepare(
      `SELECT
        ab_variant,
        COUNT(*) as sent,
        SUM(CASE WHEN status IN ('delivered', 'opened', 'clicked') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
      FROM delivery_logs
      WHERE campaign_id = ? AND ab_variant IS NOT NULL
      GROUP BY ab_variant`
    )
    .bind(campaignId)
    .all();

  if (!results.results || results.results.length === 0) {
    return null;
  }

  const emptyStats: AbVariantStats = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    open_rate: 0,
    click_rate: 0,
    score: 0,
  };
  const statsMap: Record<string, AbVariantStats> = {};

  for (const row of results.results) {
    const variant = row.ab_variant as string;
    const sent = row.sent as number;
    const opened = row.opened as number;
    const clicked = row.clicked as number;

    const open_rate = sent > 0 ? opened / sent : 0;
    const click_rate = sent > 0 ? clicked / sent : 0;
    const score = calculateAbScore(open_rate, click_rate);

    statsMap[variant] = {
      sent,
      delivered: row.delivered as number,
      opened,
      clicked,
      open_rate,
      click_rate,
      score,
    };
  }

  const variant_a = statsMap['A'] || emptyStats;
  const variant_b = statsMap['B'] || emptyStats;

  let winner: 'A' | 'B' | null = null;
  let status: 'pending' | 'testing' | 'determined' = 'pending';

  // If campaign has ab_winner set, the test is determined
  if (campaignAbWinner) {
    status = 'determined';
    winner = campaignAbWinner;
  } else if (variant_a.sent > 0 || variant_b.sent > 0) {
    status = 'testing';
    // Calculate current winner based on stats (for display purposes)
    if (variant_a.sent > 0 && variant_b.sent > 0) {
      winner = determineWinner(variant_a, variant_b);
    }
  }

  return { variant_a, variant_b, winner, status };
}

export async function createCampaign(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateCampaignRequest>();
    const {
      subject,
      content,
      scheduled_at,
      schedule_type,
      schedule_config,
      contact_list_id,
      template_id,
      slug: providedSlug,
      excerpt: providedExcerpt,
      is_published,
      // A/B Testing fields
      ab_test_enabled = false,
      ab_subject_b = null,
      ab_from_name_b = null,
      ab_wait_hours = 4
    } = body;

    if (!subject || !content) {
      return errorResponse('Subject and content are required', 400);
    }

    const id = crypto.randomUUID();
    const status = scheduled_at ? 'scheduled' : 'draft';

    // Auto-generate slug if not provided
    const slug = providedSlug || await generateSlug(env.DB, subject);

    // Auto-generate excerpt if not provided
    const excerpt = providedExcerpt || generateExcerpt(content, 150);

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status, scheduled_at, schedule_type, schedule_config, last_sent_at, sent_at, recipient_count, contact_list_id, template_id, slug, excerpt, is_published, ab_test_enabled, ab_subject_b, ab_from_name_b, ab_wait_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      contact_list_id || null,
      template_id || null,
      slug,
      excerpt,
      is_published !== undefined ? (is_published ? 1 : 0) : 0,  // Default to unpublished
      ab_test_enabled ? 1 : 0,
      ab_subject_b,
      ab_from_name_b,
      ab_wait_hours
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

    // Include A/B stats if A/B testing is enabled
    if (campaign.ab_test_enabled) {
      const ab_stats = await getAbStats(env.DB, id, campaign.ab_winner);
      return successResponse({ campaign: { ...campaign, ab_stats } });
    }

    return successResponse({ campaign });
  } catch (error) {
    console.error('Get campaign error:', error);
    return errorResponse('Internal server error', 500);
  }
}

interface CampaignWithStats extends Campaign {
  stats?: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  };
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

    // Fetch stats for sent campaigns
    const campaignsWithStats: CampaignWithStats[] = await Promise.all(
      (campaigns.results || []).map(async (campaign) => {
        if (campaign.status !== 'sent') {
          return campaign;
        }

        const statsResult = await env.DB.prepare(`
          SELECT
            COUNT(*) as sent,
            SUM(CASE WHEN status = 'delivered' OR status = 'opened' OR status = 'clicked' THEN 1 ELSE 0 END) as delivered,
            SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
            SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
            SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
          FROM delivery_logs
          WHERE campaign_id = ?
        `).bind(campaign.id).first<{
          sent: number;
          delivered: number;
          opened: number;
          clicked: number;
          bounced: number;
        }>();

        const sent = statsResult?.sent || 0;
        const opened = statsResult?.opened || 0;
        const clicked = statsResult?.clicked || 0;

        return {
          ...campaign,
          stats: {
            sent,
            delivered: statsResult?.delivered || 0,
            opened,
            clicked,
            bounced: statsResult?.bounced || 0,
            openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          },
        };
      })
    );

    return successResponse({
      campaigns: campaignsWithStats,
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

      // Auto-generate excerpt if content changed but excerpt not provided
      if (body.excerpt === undefined) {
        updates.push('excerpt = ?');
        bindings.push(generateExcerpt(body.content, 150));
      }
    }
    if (body.status !== undefined && body.status !== 'sent') {
      updates.push('status = ?');
      bindings.push(body.status);
    }
    if (body.contact_list_id !== undefined) {
      updates.push('contact_list_id = ?');
      bindings.push(body.contact_list_id || null);
    }
    if (body.template_id !== undefined) {
      updates.push('template_id = ?');
      bindings.push(body.template_id || null);
    }
    if (body.slug !== undefined) {
      updates.push('slug = ?');
      bindings.push(body.slug);
    }
    if (body.excerpt !== undefined) {
      updates.push('excerpt = ?');
      bindings.push(body.excerpt);
    }
    if (body.is_published !== undefined) {
      updates.push('is_published = ?');
      bindings.push(body.is_published ? 1 : 0);
    }
    // A/B Testing fields
    if (body.ab_test_enabled !== undefined) {
      updates.push('ab_test_enabled = ?');
      bindings.push(body.ab_test_enabled ? 1 : 0);
    }
    if (body.ab_subject_b !== undefined) {
      updates.push('ab_subject_b = ?');
      bindings.push(body.ab_subject_b);
    }
    if (body.ab_from_name_b !== undefined) {
      updates.push('ab_from_name_b = ?');
      bindings.push(body.ab_from_name_b);
    }
    if (body.ab_wait_hours !== undefined) {
      updates.push('ab_wait_hours = ?');
      bindings.push(body.ab_wait_hours);
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
