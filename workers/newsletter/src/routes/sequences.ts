import type { Env, Sequence, SequenceStep, CreateSequenceRequest, UpdateSequenceRequest, ApiResponse } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse, successResponse, jsonResponse } from '../lib/response';
import { enrollSubscriberInSequence } from '../lib/sequence-processor';

export async function createSequence(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json<CreateSequenceRequest>();
    const { name, description, steps } = body;

    if (!name || !steps || steps.length === 0) {
      return errorResponse('Name and at least one step are required', 400);
    }

    const sequenceId = crypto.randomUUID();

    // Create sequence
    await env.DB.prepare(`
      INSERT INTO sequences (id, name, description)
      VALUES (?, ?, ?)
    `).bind(sequenceId, name, description || null).run();

    // Create steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, i + 1, step.delay_days, step.subject, step.content).run();
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

    return successResponse(sequence);
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
    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      bindings.push(body.is_active);
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    bindings.push(id);
    await env.DB.prepare(
      `UPDATE sequences SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM sequences WHERE id = ?'
    ).bind(id).first<Sequence>();

    return successResponse(updated);
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

async function getSequenceWithSteps(env: Env, id: string) {
  const sequence = await env.DB.prepare(
    'SELECT * FROM sequences WHERE id = ?'
  ).bind(id).first<Sequence>();

  if (!sequence) return null;

  const steps = await env.DB.prepare(
    'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number'
  ).bind(id).all<SequenceStep>();

  return {
    ...sequence,
    steps: steps.results || [],
  };
}
