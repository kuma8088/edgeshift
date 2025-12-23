import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import type { Sequence, SequenceStep, SubscriberSequence, CreateSequenceRequest } from '../types';

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
