import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import type { Sequence, SequenceStep, SubscriberSequence, CreateSequenceRequest } from '../types';
import { createSequence, getSequence, listSequences, updateSequence, deleteSequence } from '../routes/sequences';

describe('Sequence CRUD APIs', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('createSequence', () => {
    it('should create a sequence with steps', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Welcome Series',
          description: 'Onboarding sequence',
          steps: [
            {
              delay_days: 0,
              subject: 'Welcome!',
              content: '<p>Welcome to our newsletter</p>',
            },
            {
              delay_days: 3,
              subject: 'Getting Started',
              content: '<p>Here is how to get started</p>',
            },
          ],
        }),
      });

      const response = await createSequence(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.name).toBe('Welcome Series');
      expect(result.data.steps).toHaveLength(2);
      expect(result.data.steps[0].step_number).toBe(1);
      expect(result.data.steps[1].step_number).toBe(2);
    });

    it('should return 400 if name is missing', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
        }),
      });

      const response = await createSequence(request, env);
      expect(response.status).toBe(400);
    });

    it('should return 400 if steps are missing', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ name: 'Test Sequence' }),
      });

      const response = await createSequence(request, env);
      expect(response.status).toBe(400);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
          steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
        }),
      });

      const response = await createSequence(request, env);
      expect(response.status).toBe(401);
    });
  });

  describe('getSequence', () => {
    it('should return a sequence with steps by id', async () => {
      const env = getTestEnv();

      // Create a sequence first
      const createReq = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Test Sequence',
          steps: [
            { delay_days: 0, subject: 'Step 1', content: '<p>Content 1</p>' },
            { delay_days: 7, subject: 'Step 2', content: '<p>Content 2</p>' },
          ],
        }),
      });
      const createRes = await createSequence(createReq, env);
      const created = await createRes.json();
      const sequenceId = created.data.id;

      // Get the sequence
      const getReq = new Request(`http://localhost/api/sequences/${sequenceId}`, {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await getSequence(getReq, env, sequenceId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.id).toBe(sequenceId);
      expect(result.data.name).toBe('Test Sequence');
      expect(result.data.steps).toHaveLength(2);
      expect(result.data.steps[0].delay_days).toBe(0);
      expect(result.data.steps[1].delay_days).toBe(7);
    });

    it('should return 404 if sequence not found', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/non-existent', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getSequence(request, env, 'non-existent');
      expect(response.status).toBe(404);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/test-id', {
        headers: {},
      });

      const response = await getSequence(request, env, 'test-id');
      expect(response.status).toBe(401);
    });
  });

  describe('listSequences', () => {
    it('should return all sequences', async () => {
      const env = getTestEnv();

      // Create two sequences
      await createSequence(
        new Request('http://localhost/api/sequences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          },
          body: JSON.stringify({
            name: 'Sequence 1',
            steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
          }),
        }),
        env
      );

      await createSequence(
        new Request('http://localhost/api/sequences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          },
          body: JSON.stringify({
            name: 'Sequence 2',
            steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
          }),
        }),
        env
      );

      const request = new Request('http://localhost/api/sequences', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await listSequences(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.sequences).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('should return empty array if no sequences', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await listSequences(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.sequences).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences', {
        headers: {},
      });

      const response = await listSequences(request, env);
      expect(response.status).toBe(401);
    });
  });

  describe('updateSequence', () => {
    it('should update sequence name and description', async () => {
      const env = getTestEnv();

      // Create a sequence
      const createReq = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Original Name',
          description: 'Original Description',
          steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
        }),
      });
      const createRes = await createSequence(createReq, env);
      const created = await createRes.json();
      const sequenceId = created.data.id;

      // Update the sequence
      const updateReq = new Request(`http://localhost/api/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Updated Name',
          description: 'Updated Description',
        }),
      });

      const response = await updateSequence(updateReq, env, sequenceId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.name).toBe('Updated Name');
      expect(result.data.description).toBe('Updated Description');
    });

    it('should update is_active status', async () => {
      const env = getTestEnv();

      // Create a sequence
      const createReq = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Test Sequence',
          steps: [{ delay_days: 0, subject: 'Test', content: '<p>Test</p>' }],
        }),
      });
      const createRes = await createSequence(createReq, env);
      const created = await createRes.json();
      const sequenceId = created.data.id;

      // Deactivate the sequence
      const updateReq = new Request(`http://localhost/api/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ is_active: 0 }),
      });

      const response = await updateSequence(updateReq, env, sequenceId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.is_active).toBe(0);
    });

    it('should return 404 if sequence not found', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/non-existent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await updateSequence(request, env, 'non-existent');
      expect(response.status).toBe(404);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/test-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await updateSequence(request, env, 'test-id');
      expect(response.status).toBe(401);
    });
  });

  describe('deleteSequence', () => {
    it('should delete a sequence and its steps', async () => {
      const env = getTestEnv();

      // Create a sequence
      const createReq = new Request('http://localhost/api/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          name: 'Test Sequence',
          steps: [
            { delay_days: 0, subject: 'Step 1', content: '<p>Content 1</p>' },
            { delay_days: 7, subject: 'Step 2', content: '<p>Content 2</p>' },
          ],
        }),
      });
      const createRes = await createSequence(createReq, env);
      const created = await createRes.json();
      const sequenceId = created.data.id;

      // Delete the sequence
      const deleteReq = new Request(`http://localhost/api/sequences/${sequenceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await deleteSequence(deleteReq, env, sequenceId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.message).toBe('Sequence deleted');

      // Verify it's deleted
      const steps = await env.DB.prepare(
        'SELECT * FROM sequence_steps WHERE sequence_id = ?'
      ).bind(sequenceId).all();
      expect(steps.results).toHaveLength(0);

      const sequence = await env.DB.prepare(
        'SELECT * FROM sequences WHERE id = ?'
      ).bind(sequenceId).first();
      expect(sequence).toBeNull();
    });

    it('should return 404 if sequence not found', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/non-existent', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await deleteSequence(request, env, 'non-existent');
      expect(response.status).toBe(404);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/sequences/test-id', {
        method: 'DELETE',
        headers: {},
      });

      const response = await deleteSequence(request, env, 'test-id');
      expect(response.status).toBe(401);
    });
  });
});

describe('Sequence Types and Schema', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should create a sequence with correct types', async () => {
    const env = getTestEnv();
    const sequenceId = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, description, is_active)
      VALUES (?, ?, ?, ?)
    `).bind(sequenceId, 'Welcome Series', 'Onboarding sequence for new subscribers', 1).run();

    const sequence = await env.DB.prepare(
      'SELECT * FROM sequences WHERE id = ?'
    ).bind(sequenceId).first<Sequence>();

    expect(sequence).toBeDefined();
    expect(sequence?.id).toBe(sequenceId);
    expect(sequence?.name).toBe('Welcome Series');
    expect(sequence?.description).toBe('Onboarding sequence for new subscribers');
    expect(sequence?.is_active).toBe(1);
    expect(sequence?.created_at).toBeDefined();
  });

  it('should create sequence steps with correct types', async () => {
    const env = getTestEnv();
    const sequenceId = crypto.randomUUID();
    const stepId = crypto.randomUUID();

    // Create sequence first
    await env.DB.prepare(`
      INSERT INTO sequences (id, name)
      VALUES (?, ?)
    `).bind(sequenceId, 'Test Sequence').run();

    // Create step
    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(stepId, sequenceId, 1, 0, 'Welcome!', '<p>Welcome to our newsletter</p>').run();

    const step = await env.DB.prepare(
      'SELECT * FROM sequence_steps WHERE id = ?'
    ).bind(stepId).first<SequenceStep>();

    expect(step).toBeDefined();
    expect(step?.id).toBe(stepId);
    expect(step?.sequence_id).toBe(sequenceId);
    expect(step?.step_number).toBe(1);
    expect(step?.delay_days).toBe(0);
    expect(step?.subject).toBe('Welcome!');
    expect(step?.content).toBe('<p>Welcome to our newsletter</p>');
    expect(step?.created_at).toBeDefined();
  });

  it('should create subscriber sequences with correct types', async () => {
    const env = getTestEnv();
    const sequenceId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();
    const enrollmentId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Create sequence
    await env.DB.prepare(`
      INSERT INTO sequences (id, name)
      VALUES (?, ?)
    `).bind(sequenceId, 'Test Sequence').run();

    // Create subscriber
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status)
      VALUES (?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active').run();

    // Enroll subscriber
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(enrollmentId, subscriberId, sequenceId, 0, now).run();

    const enrollment = await env.DB.prepare(
      'SELECT * FROM subscriber_sequences WHERE id = ?'
    ).bind(enrollmentId).first<SubscriberSequence>();

    expect(enrollment).toBeDefined();
    expect(enrollment?.id).toBe(enrollmentId);
    expect(enrollment?.subscriber_id).toBe(subscriberId);
    expect(enrollment?.sequence_id).toBe(sequenceId);
    expect(enrollment?.current_step).toBe(0);
    expect(enrollment?.started_at).toBe(now);
    expect(enrollment?.completed_at).toBeNull();
    expect(enrollment?.created_at).toBeDefined();
  });

  it('should enforce unique constraint on subscriber_id and sequence_id', async () => {
    const env = getTestEnv();
    const sequenceId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();

    // Create sequence and subscriber
    await env.DB.prepare(`
      INSERT INTO sequences (id, name)
      VALUES (?, ?)
    `).bind(sequenceId, 'Test Sequence').run();

    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, status)
      VALUES (?, ?, ?)
    `).bind(subscriberId, 'test@example.com', 'active').run();

    // First enrollment should succeed
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step)
      VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), subscriberId, sequenceId, 0).run();

    // Second enrollment with same subscriber and sequence should fail
    await expect(
      env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step)
        VALUES (?, ?, ?, ?)
      `).bind(crypto.randomUUID(), subscriberId, sequenceId, 0).run()
    ).rejects.toThrow();
  });

  it('should cascade delete sequence steps when sequence is deleted', async () => {
    const env = getTestEnv();
    const sequenceId = crypto.randomUUID();
    const stepId = crypto.randomUUID();

    // Create sequence and step
    await env.DB.prepare(`
      INSERT INTO sequences (id, name)
      VALUES (?, ?)
    `).bind(sequenceId, 'Test Sequence').run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(stepId, sequenceId, 1, 0, 'Test', '<p>Test</p>').run();

    // Verify step exists
    const stepBefore = await env.DB.prepare(
      'SELECT * FROM sequence_steps WHERE id = ?'
    ).bind(stepId).first<SequenceStep>();
    expect(stepBefore).toBeDefined();

    // Delete sequence
    await env.DB.prepare('DELETE FROM sequences WHERE id = ?').bind(sequenceId).run();

    // Verify step is also deleted
    const stepAfter = await env.DB.prepare(
      'SELECT * FROM sequence_steps WHERE id = ?'
    ).bind(stepId).first<SequenceStep>();
    expect(stepAfter).toBeNull();
  });

  it('should validate CreateSequenceRequest type', () => {
    const request: CreateSequenceRequest = {
      name: 'Welcome Series',
      description: 'Onboarding emails',
      steps: [
        {
          delay_days: 0,
          subject: 'Welcome!',
          content: '<p>Welcome email</p>',
        },
        {
          delay_days: 3,
          subject: 'Getting Started',
          content: '<p>Getting started email</p>',
        },
      ],
    };

    expect(request.name).toBe('Welcome Series');
    expect(request.description).toBe('Onboarding emails');
    expect(request.steps).toHaveLength(2);
    expect(request.steps[0].delay_days).toBe(0);
    expect(request.steps[1].delay_days).toBe(3);
  });

  it('should allow CreateSequenceRequest without description', () => {
    const request: CreateSequenceRequest = {
      name: 'Welcome Series',
      steps: [
        {
          delay_days: 0,
          subject: 'Welcome!',
          content: '<p>Welcome email</p>',
        },
      ],
    };

    expect(request.name).toBe('Welcome Series');
    expect(request.description).toBeUndefined();
    expect(request.steps).toHaveLength(1);
  });
});
