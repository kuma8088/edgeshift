import type { Env, Sequence, SequenceStep, CreateSequenceRequest, UpdateSequenceRequest, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse, successResponse, jsonResponse } from '../lib/response';
import { enrollSubscriberInSequence } from '../lib/sequence-processor';
import { isValidTime } from '../lib/validation';

export async function createSequence(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateSequenceRequest>();
    const { name, description, default_send_time, steps } = body;

    if (!name || !steps || steps.length === 0) {
      return errorResponse('Name and at least one step are required', 400);
    }

    if (!default_send_time || !isValidTime(default_send_time)) {
      return errorResponse('default_send_time is required in HH:MM format (00:00-23:59)', 400);
    }

    // Pre-validate all steps BEFORE any database inserts to avoid orphaned rows
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.delay_time && !isValidTime(step.delay_time)) {
        return errorResponse(`Step ${i + 1}: delay_time must be in HH:MM format (00:00-23:59)`, 400);
      }
    }

    const sequenceId = crypto.randomUUID();

    // Create sequence with default_send_time
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, description, default_send_time)
      VALUES (?, ?, ?, ?)
    `).bind(sequenceId, name, description || null, default_send_time).run();

    // Create steps (already validated above)
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, delay_minutes, subject, content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        stepId,
        sequenceId,
        i + 1,
        step.delay_days,
        step.delay_time || null,
        step.delay_minutes ?? null,
        step.subject,
        step.content
      ).run();
    }

    const sequence = await getSequenceWithSteps(env, sequenceId);

    return jsonResponse<ApiResponse>({
      success: true,
      data: sequence,
    }, 201);
  } catch (error) {
    console.error('Create sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getSequence(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequence = await getSequenceWithSteps(env, id);

    if (!sequence) {
      return errorResponse('Sequence not found', 404);
    }

    return successResponse({ sequence });
  } catch (error) {
    console.error('Get sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function listSequences(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequences = await env.DB.prepare(
      'SELECT * FROM sequences ORDER BY created_at DESC'
    ).all<Sequence>();

    return successResponse({
      sequences: sequences.results || [],
      total: sequences.results?.length || 0,
    });
  } catch (error) {
    console.error('List sequences error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function updateSequence(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    // Check if sequence exists
    const existing = await env.DB.prepare(
      'SELECT * FROM sequences WHERE id = ?'
    ).bind(id).first<Sequence>();

    if (!existing) {
      return errorResponse('Sequence not found', 404);
    }

    const body = await request.json<UpdateSequenceRequest>();

    const updates: string[] = [];
    const bindings: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      bindings.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      bindings.push(body.description);
    }
    if (body.default_send_time !== undefined) {
      if (!isValidTime(body.default_send_time)) {
        return errorResponse('default_send_time must be in HH:MM format (00:00-23:59)', 400);
      }
      updates.push('default_send_time = ?');
      bindings.push(body.default_send_time);
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      bindings.push(body.is_active);
    }

    // Update sequence metadata if any fields provided
    if (updates.length > 0) {
      bindings.push(id);
      const sql = `UPDATE sequences SET ${updates.join(', ')} WHERE id = ?`;
      await env.DB.prepare(sql).bind(...bindings).run();
    }

    // Update steps if provided
    if (body.steps && body.steps.length > 0) {
      // Validate steps first
      for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        if (step.delay_time && !isValidTime(step.delay_time)) {
          return errorResponse(`Step ${i + 1}: delay_time must be in HH:MM format`, 400);
        }
      }

      // Phase 1: Insert new steps as DISABLED (is_enabled = 0)
      // If any insert fails, only disabled (non-deliverable) steps remain
      const newStepIds: string[] = [];
      for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        const stepId = crypto.randomUUID();
        newStepIds.push(stepId);
        await env.DB.prepare(`
          INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, delay_minutes, subject, content, is_enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(
          stepId,
          id,
          i + 1,
          step.delay_days,
          step.delay_time || null,
          step.delay_minutes ?? null,
          step.subject,
          step.content
        ).run();
      }

      // Phase 2: Atomically switch - disable old steps AND enable new steps in batch
      // D1 batch() executes all statements in a single round-trip
      // Even if one fails, old steps remain enabled (delivery continues)
      const placeholders = newStepIds.map(() => '?').join(',');
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE sequence_steps SET is_enabled = 0 WHERE sequence_id = ? AND is_enabled = 1'
        ).bind(id),
        env.DB.prepare(
          `UPDATE sequence_steps SET is_enabled = 1 WHERE id IN (${placeholders})`
        ).bind(...newStepIds),
      ]);
    }

    // Return updated sequence with steps
    const sequence = await getSequenceWithSteps(env, id);
    return successResponse(sequence);
  } catch (error) {
    console.error('Update sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function deleteSequence(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const sequence = await env.DB.prepare(
      'SELECT * FROM sequences WHERE id = ?'
    ).bind(id).first<Sequence>();

    if (!sequence) {
      return errorResponse('Sequence not found', 404);
    }

    // Delete sequence (CASCADE will delete steps and enrollments)
    await env.DB.prepare('DELETE FROM sequences WHERE id = ?').bind(id).run();

    return successResponse({ message: 'Sequence deleted' });
  } catch (error) {
    console.error('Delete sequence error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function enrollSubscriber(
  request: Request,
  env: Env,
  sequenceId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<{ subscriber_id: string }>();
    const { subscriber_id } = body;

    if (!subscriber_id) {
      return errorResponse('subscriber_id is required', 400);
    }

    await enrollSubscriberInSequence(env, subscriber_id, sequenceId);

    return successResponse({
      message: 'Subscriber enrolled in sequence',
      subscriber_id,
      sequence_id: sequenceId,
    });
  } catch (error) {
    console.error('Enroll subscriber error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    // Return specific error messages for known errors
    if (errorMessage.includes('not found') || errorMessage.includes('not active') || errorMessage.includes('already enrolled')) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse('Internal server error', 500);
  }
}

export async function getSubscriberProgress(
  request: Request,
  env: Env,
  subscriberId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const progress = await env.DB.prepare(`
      SELECT
        ss.id,
        ss.sequence_id,
        ss.current_step,
        ss.started_at,
        ss.completed_at,
        seq.name as sequence_name,
        (SELECT COUNT(*) FROM sequence_steps WHERE sequence_id = ss.sequence_id) as total_steps
      FROM subscriber_sequences ss
      JOIN sequences seq ON seq.id = ss.sequence_id
      WHERE ss.subscriber_id = ?
    `).bind(subscriberId).all();

    return successResponse({
      subscriber_id: subscriberId,
      sequences: progress.results || [],
    });
  } catch (error) {
    console.error('Get subscriber progress error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getSequenceSubscribers(
  request: Request,
  env: Env,
  sequenceId: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const subscribers = await env.DB.prepare(`
      SELECT
        ss.id,
        ss.subscriber_id,
        ss.current_step,
        ss.started_at,
        ss.completed_at,
        s.email,
        s.name
      FROM subscriber_sequences ss
      JOIN subscribers s ON s.id = ss.subscriber_id
      WHERE ss.sequence_id = ?
      ORDER BY ss.started_at DESC
    `).bind(sequenceId).all();

    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as in_progress
      FROM subscriber_sequences
      WHERE sequence_id = ?
    `).bind(sequenceId).first();

    return successResponse({
      sequence_id: sequenceId,
      subscribers: subscribers.results || [],
      stats: {
        total: stats?.total || 0,
        completed: stats?.completed || 0,
        in_progress: stats?.in_progress || 0,
      },
    });
  } catch (error) {
    console.error('Get sequence subscribers error:', error);
    return errorResponse('Internal server error', 500);
  }
}

async function getSequenceWithSteps(env: Env, id: string, includeDisabled = false) {
  const sequence = await env.DB.prepare(
    'SELECT * FROM sequences WHERE id = ?'
  ).bind(id).first<Sequence>();

  if (!sequence) return null;

  // By default, only return enabled steps
  const query = includeDisabled
    ? 'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number'
    : 'SELECT * FROM sequence_steps WHERE sequence_id = ? AND is_enabled = 1 ORDER BY step_number';

  const steps = await env.DB.prepare(query).bind(id).all<SequenceStep>();

  return {
    ...sequence,
    steps: steps.results || [],
  };
}
