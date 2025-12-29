import type {
  Env,
  ApiResponse,
  Subscriber,
  ReferralMilestone,
  ReferralAchievement,
  ReferralDashboardResponse,
  ReferralStatsResponse,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from '../types';

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/referral/dashboard/:referralCode
 * Public endpoint to get referral dashboard data
 */
export async function handleGetReferralDashboard(
  request: Request,
  env: Env,
  referralCode: string
): Promise<Response> {
  try {
    // Find subscriber by referral code
    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE referral_code = ? AND status = 'active'"
    ).bind(referralCode).first<Subscriber>();

    if (!subscriber) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Invalid referral code' },
        404
      );
    }

    // Get achievements with milestone details
    const achievementsResult = await env.DB.prepare(`
      SELECT
        a.id,
        a.achieved_at,
        m.name as milestone_name,
        m.threshold,
        m.reward_type,
        m.reward_value
      FROM referral_achievements a
      JOIN referral_milestones m ON a.milestone_id = m.id
      WHERE a.subscriber_id = ?
      ORDER BY m.threshold ASC
    `).bind(subscriber.id).all<{
      id: string;
      achieved_at: number;
      milestone_name: string;
      threshold: number;
      reward_type: string | null;
      reward_value: string | null;
    }>();

    const achievements = achievementsResult.results || [];

    // Get next milestone
    const nextMilestone = await env.DB.prepare(`
      SELECT name, threshold
      FROM referral_milestones
      WHERE threshold > ?
      ORDER BY threshold ASC
      LIMIT 1
    `).bind(subscriber.referral_count).first<{ name: string; threshold: number }>();

    const response: ReferralDashboardResponse = {
      referral_code: referralCode,
      referral_link: `${env.SITE_URL}/newsletter?ref=${referralCode}`,
      referral_count: subscriber.referral_count,
      achievements: achievements.map(a => ({
        id: a.id,
        milestone_name: a.milestone_name,
        threshold: a.threshold,
        achieved_at: a.achieved_at,
        reward_type: a.reward_type,
        reward_value: a.reward_value,
      })),
    };

    if (nextMilestone) {
      response.next_milestone = {
        name: nextMilestone.name,
        threshold: nextMilestone.threshold,
        remaining: nextMilestone.threshold - subscriber.referral_count,
      };
    }

    return jsonResponse<ApiResponse<ReferralDashboardResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get referral dashboard error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

/**
 * GET /api/admin/milestones
 * Get all milestones (admin only)
 */
export async function handleGetMilestones(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM referral_milestones ORDER BY threshold ASC'
    ).all<ReferralMilestone>();

    return jsonResponse<ApiResponse<ReferralMilestone[]>>({
      success: true,
      data: result.results || [],
    });
  } catch (error) {
    console.error('Get milestones error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

/**
 * POST /api/admin/milestones
 * Create a new milestone (admin only)
 */
export async function handleCreateMilestone(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<CreateMilestoneRequest>();

    if (!body.threshold || !body.name) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'threshold and name are required' },
        400
      );
    }

    if (body.threshold < 1) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'threshold must be at least 1' },
        400
      );
    }

    // Check for duplicate threshold
    const existing = await env.DB.prepare(
      'SELECT id FROM referral_milestones WHERE threshold = ?'
    ).bind(body.threshold).first();

    if (existing) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'A milestone with this threshold already exists' },
        409
      );
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(`
      INSERT INTO referral_milestones (id, threshold, name, description, reward_type, reward_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.threshold,
      body.name,
      body.description || null,
      body.reward_type || null,
      body.reward_value || null,
      now
    ).run();

    const milestone = await env.DB.prepare(
      'SELECT * FROM referral_milestones WHERE id = ?'
    ).bind(id).first<ReferralMilestone>();

    return jsonResponse<ApiResponse<ReferralMilestone>>(
      { success: true, data: milestone! },
      201
    );
  } catch (error) {
    console.error('Create milestone error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

/**
 * PUT /api/admin/milestones/:id
 * Update a milestone (admin only)
 */
export async function handleUpdateMilestone(
  request: Request,
  env: Env,
  milestoneId: string
): Promise<Response> {
  try {
    const existing = await env.DB.prepare(
      'SELECT * FROM referral_milestones WHERE id = ?'
    ).bind(milestoneId).first<ReferralMilestone>();

    if (!existing) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Milestone not found' },
        404
      );
    }

    const body = await request.json<UpdateMilestoneRequest>();

    // Check for duplicate threshold if changing
    if (body.threshold !== undefined && body.threshold !== existing.threshold) {
      const duplicate = await env.DB.prepare(
        'SELECT id FROM referral_milestones WHERE threshold = ? AND id != ?'
      ).bind(body.threshold, milestoneId).first();

      if (duplicate) {
        return jsonResponse<ApiResponse>(
          { success: false, error: 'A milestone with this threshold already exists' },
          409
        );
      }
    }

    await env.DB.prepare(`
      UPDATE referral_milestones
      SET threshold = ?,
          name = ?,
          description = ?,
          reward_type = ?,
          reward_value = ?
      WHERE id = ?
    `).bind(
      body.threshold ?? existing.threshold,
      body.name ?? existing.name,
      body.description ?? existing.description,
      body.reward_type ?? existing.reward_type,
      body.reward_value ?? existing.reward_value,
      milestoneId
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM referral_milestones WHERE id = ?'
    ).bind(milestoneId).first<ReferralMilestone>();

    return jsonResponse<ApiResponse<ReferralMilestone>>({
      success: true,
      data: updated!,
    });
  } catch (error) {
    console.error('Update milestone error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

/**
 * DELETE /api/admin/milestones/:id
 * Delete a milestone (admin only)
 */
export async function handleDeleteMilestone(
  request: Request,
  env: Env,
  milestoneId: string
): Promise<Response> {
  try {
    const existing = await env.DB.prepare(
      'SELECT * FROM referral_milestones WHERE id = ?'
    ).bind(milestoneId).first<ReferralMilestone>();

    if (!existing) {
      return jsonResponse<ApiResponse>(
        { success: false, error: 'Milestone not found' },
        404
      );
    }

    // Delete related achievements first (cascade should handle this, but be explicit)
    await env.DB.prepare(
      'DELETE FROM referral_achievements WHERE milestone_id = ?'
    ).bind(milestoneId).run();

    await env.DB.prepare(
      'DELETE FROM referral_milestones WHERE id = ?'
    ).bind(milestoneId).run();

    return jsonResponse<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Delete milestone error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}

/**
 * GET /api/admin/referral-stats
 * Get referral statistics (admin only)
 */
export async function handleGetReferralStats(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Total referrals
    const totalResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(referral_count), 0) as total
      FROM subscribers
      WHERE status = 'active'
    `).first<{ total: number }>();

    // Active referrers (users with at least 1 referral)
    const activeResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM subscribers
      WHERE status = 'active' AND referral_count > 0
    `).first<{ count: number }>();

    // Top referrers
    const topResult = await env.DB.prepare(`
      SELECT id, email, referral_count
      FROM subscribers
      WHERE status = 'active' AND referral_count > 0
      ORDER BY referral_count DESC
      LIMIT 10
    `).all<{ id: string; email: string; referral_count: number }>();

    const response: ReferralStatsResponse = {
      total_referrals: totalResult?.total || 0,
      active_referrers: activeResult?.count || 0,
      top_referrers: topResult.results || [],
    };

    return jsonResponse<ApiResponse<ReferralStatsResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    return jsonResponse<ApiResponse>(
      { success: false, error: 'Internal server error' },
      500
    );
  }
}
