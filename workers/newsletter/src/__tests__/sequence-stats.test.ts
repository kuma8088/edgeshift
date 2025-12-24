import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('sequence stats API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('getSequenceStats', () => {
    it('should return step-by-step statistics for a sequence', async () => {
      const env = getTestEnv();

      // Setup: Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES
          ('sub-1', 'user1@example.com', 'active'),
          ('sub-2', 'user2@example.com', 'active'),
          ('sub-3', 'user3@example.com', 'active')
      `).run();

      // Setup: Create sequence
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, description, is_active)
        VALUES ('seq-1', 'Welcome Series', 'Onboarding sequence', 1)
      `).run();

      // Setup: Create sequence steps
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES
          ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome content</p>'),
          ('step-2', 'seq-1', 2, 3, 'Getting Started', '<p>Getting started content</p>'),
          ('step-3', 'seq-1', 3, 7, 'Advanced Tips', '<p>Advanced tips content</p>')
      `).run();

      // Setup: Create subscriber enrollments
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at, completed_at)
        VALUES
          ('ss-1', 'sub-1', 'seq-1', 3, 1703404800, 1703664000),
          ('ss-2', 'sub-2', 'seq-1', 2, 1703491200, NULL),
          ('ss-3', 'sub-3', 'seq-1', 1, 1703577600, NULL)
      `).run();

      // Setup: Create delivery logs for steps
      // sub-1 completed all steps (opened step 1, clicked step 2, delivered step 3)
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at, opened_at)
        VALUES
          ('dl-1', 'seq-1', 'step-1', 'sub-1', 'user1@example.com', 'opened', 1703404800, 1703408400),
          ('dl-2', 'seq-1', 'step-2', 'sub-1', 'user1@example.com', 'clicked', 1703664000, 1703667600),
          ('dl-3', 'seq-1', 'step-3', 'sub-1', 'user1@example.com', 'delivered', 1703750400, NULL)
      `).run();

      // sub-2 completed first 2 steps (delivered step 1, opened step 2)
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at, delivered_at)
        VALUES
          ('dl-4', 'seq-1', 'step-1', 'sub-2', 'user2@example.com', 'delivered', 1703491200, 1703494800),
          ('dl-5', 'seq-1', 'step-2', 'sub-2', 'user2@example.com', 'opened', 1703750400, 1703754000)
      `).run();

      // sub-3 only completed first step (delivered)
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, sequence_id, sequence_step_id, subscriber_id, email, status, sent_at, delivered_at)
        VALUES
          ('dl-6', 'seq-1', 'step-1', 'sub-3', 'user3@example.com', 'delivered', 1703577600, 1703581200)
      `).run();

      // Import and call the function
      const { getSequenceStats } = await import('../routes/tracking');
      const result = await getSequenceStats(env, 'seq-1');

      expect(result).not.toBeNull();
      expect(result!.sequence_id).toBe('seq-1');
      expect(result!.name).toBe('Welcome Series');
      expect(result!.description).toBe('Onboarding sequence');

      // Enrollment stats
      expect(result!.enrollment_stats.total_enrolled).toBe(3);
      expect(result!.enrollment_stats.completed).toBe(1); // sub-1 completed
      expect(result!.enrollment_stats.in_progress).toBe(2); // sub-2, sub-3 still in progress

      // Step stats
      expect(result!.steps).toHaveLength(3);

      // Step 1: 3 sent, 3 delivered, 1 opened (sub-1), 0 clicked
      expect(result!.steps[0].step_number).toBe(1);
      expect(result!.steps[0].subject).toBe('Welcome!');
      expect(result!.steps[0].sent).toBe(3);
      expect(result!.steps[0].delivered).toBe(3);
      expect(result!.steps[0].opened).toBe(1);
      expect(result!.steps[0].clicked).toBe(0);
      expect(result!.steps[0].delivery_rate).toBe(100.0); // 3/3
      expect(result!.steps[0].open_rate).toBe(33.3); // 1/3
      expect(result!.steps[0].click_rate).toBe(0.0); // 0/3

      // Step 2: 2 sent, 0 delivered (純粋な delivered はなし), 1 opened (sub-2), 1 clicked (sub-1)
      // opened/clicked も配信成功とみなすため、delivery_rate = 100%
      expect(result!.steps[1].step_number).toBe(2);
      expect(result!.steps[1].subject).toBe('Getting Started');
      expect(result!.steps[1].sent).toBe(2);
      expect(result!.steps[1].delivered).toBe(2); // opened + clicked は配信成功
      expect(result!.steps[1].opened).toBe(1);
      expect(result!.steps[1].clicked).toBe(1);
      expect(result!.steps[1].delivery_rate).toBe(100.0); // 2/2 (opened + clicked)
      expect(result!.steps[1].open_rate).toBe(50.0); // 1/2
      expect(result!.steps[1].click_rate).toBe(50.0); // 1/2

      // Step 3: 1 sent, 1 delivered, 0 opened, 0 clicked
      expect(result!.steps[2].step_number).toBe(3);
      expect(result!.steps[2].subject).toBe('Advanced Tips');
      expect(result!.steps[2].sent).toBe(1);
      expect(result!.steps[2].delivered).toBe(1);
      expect(result!.steps[2].opened).toBe(0);
      expect(result!.steps[2].clicked).toBe(0);
      expect(result!.steps[2].delivery_rate).toBe(100.0); // 1/1
      expect(result!.steps[2].open_rate).toBe(0.0); // 0/1
      expect(result!.steps[2].click_rate).toBe(0.0); // 0/1
    });

    it('should return null for non-existent sequence', async () => {
      const env = getTestEnv();
      const { getSequenceStats } = await import('../routes/tracking');
      const result = await getSequenceStats(env, 'non-existent');
      expect(result).toBeNull();
    });

    it('should handle sequence with no enrollments', async () => {
      const env = getTestEnv();

      // Setup: Create sequence with no enrollments
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES ('seq-empty', 'Empty Sequence', 1)
      `).run();

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES ('step-1', 'seq-empty', 1, 0, 'Welcome!', '<p>Content</p>')
      `).run();

      const { getSequenceStats } = await import('../routes/tracking');
      const result = await getSequenceStats(env, 'seq-empty');

      expect(result).not.toBeNull();
      expect(result!.enrollment_stats.total_enrolled).toBe(0);
      expect(result!.enrollment_stats.completed).toBe(0);
      expect(result!.enrollment_stats.in_progress).toBe(0);
      expect(result!.steps).toHaveLength(1);
      expect(result!.steps[0].sent).toBe(0);
      expect(result!.steps[0].delivery_rate).toBe(0);
    });
  });
});
