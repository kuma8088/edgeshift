import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { processSequenceEmails, enrollSubscriberInSequences, enrollSubscriberInSequence } from '../lib/sequence-processor';
import * as email from '../lib/email';

// Mock the email module
vi.mock('../lib/email', () => ({
  sendEmail: vi.fn(),
}));

describe('Sequence Processor', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('enrollSubscriberInSequences', () => {
    it('should enroll subscriber in all active sequences', async () => {
      const env = getTestEnv();

      // Create active subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      // Create active sequences
      const seq1Id = crypto.randomUUID();
      const seq2Id = crypto.randomUUID();
      const seq3Id = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(seq1Id, 'Sequence 1', 1).run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(seq2Id, 'Sequence 2', 1).run();

      // Inactive sequence (should not be enrolled)
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(seq3Id, 'Sequence 3', 0).run();

      // Enroll subscriber
      await enrollSubscriberInSequences(env, subscriberId);

      // Verify enrollments
      const enrollments = await env.DB.prepare(
        'SELECT * FROM subscriber_sequences WHERE subscriber_id = ?'
      ).bind(subscriberId).all();

      expect(enrollments.results).toHaveLength(2);
      expect(enrollments.results?.map(e => e.sequence_id).sort()).toEqual([seq1Id, seq2Id].sort());
    });

    it('should not enroll if already enrolled', async () => {
      const env = getTestEnv();

      // Create subscriber and sequence
      const subscriberId = crypto.randomUUID();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      // First enrollment
      await enrollSubscriberInSequences(env, subscriberId);

      // Second enrollment (should not create duplicate)
      await enrollSubscriberInSequences(env, subscriberId);

      // Verify only one enrollment
      const enrollments = await env.DB.prepare(
        'SELECT * FROM subscriber_sequences WHERE subscriber_id = ?'
      ).bind(subscriberId).all();

      expect(enrollments.results).toHaveLength(1);
    });
  });

  describe('enrollSubscriberInSequence', () => {
    it('should enroll subscriber in specific sequence', async () => {
      const env = getTestEnv();

      // Create subscriber and sequence
      const subscriberId = crypto.randomUUID();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      await enrollSubscriberInSequence(env, subscriberId, sequenceId);

      // Verify enrollment
      const enrollment = await env.DB.prepare(
        'SELECT * FROM subscriber_sequences WHERE subscriber_id = ? AND sequence_id = ?'
      ).bind(subscriberId, sequenceId).first();

      expect(enrollment).toBeDefined();
      expect(enrollment?.current_step).toBe(0);
      expect(enrollment?.started_at).toBeDefined();
      expect(enrollment?.completed_at).toBeNull();
    });

    it('should throw error if subscriber not found', async () => {
      const env = getTestEnv();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      await expect(
        enrollSubscriberInSequence(env, 'non-existent', sequenceId)
      ).rejects.toThrow('Subscriber not found');
    });

    it('should throw error if subscriber is not active', async () => {
      const env = getTestEnv();
      const subscriberId = crypto.randomUUID();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'pending').run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      await expect(
        enrollSubscriberInSequence(env, subscriberId, sequenceId)
      ).rejects.toThrow('Subscriber is not active');
    });

    it('should throw error if sequence not found', async () => {
      const env = getTestEnv();
      const subscriberId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      await expect(
        enrollSubscriberInSequence(env, subscriberId, 'non-existent')
      ).rejects.toThrow('Sequence not found');
    });

    it('should throw error if sequence is not active', async () => {
      const env = getTestEnv();
      const subscriberId = crypto.randomUUID();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 0).run();

      await expect(
        enrollSubscriberInSequence(env, subscriberId, sequenceId)
      ).rejects.toThrow('Sequence is not active');
    });

    it('should throw error if already enrolled', async () => {
      const env = getTestEnv();
      const subscriberId = crypto.randomUUID();
      const sequenceId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active').run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      // First enrollment
      await enrollSubscriberInSequence(env, subscriberId, sequenceId);

      // Second enrollment should fail
      await expect(
        enrollSubscriberInSequence(env, subscriberId, sequenceId)
      ).rejects.toThrow('already enrolled');
    });
  });

  describe('processSequenceEmails', () => {
    it('should send due sequence emails', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);
      mockSendEmail.mockResolvedValue({ success: true });

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES (?, ?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'Test User', 'active', 'unsub-token').run();

      // Create sequence with 2 steps
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Welcome Series', 1).run();

      const step1Id = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(step1Id, sequenceId, 1, 0, 'Welcome!', '<p>Welcome to our newsletter</p>').run();

      const step2Id = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(step2Id, sequenceId, 2, 3, 'Getting Started', '<p>Here is how to get started</p>').run();

      // Enroll subscriber 4 days ago (past delay for step 1)
      const fourDaysAgo = Math.floor(Date.now() / 1000) - (4 * 86400);
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, fourDaysAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify email was sent
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        env.RESEND_API_KEY,
        `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome!',
        })
      );

      // Verify progress was updated
      const updated = await env.DB.prepare(
        'SELECT * FROM subscriber_sequences WHERE id = ?'
      ).bind(enrollmentId).first();

      expect(updated?.current_step).toBe(1);
      expect(updated?.completed_at).toBeNull(); // Not completed yet
    });

    it('should mark sequence as completed after last step', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);
      mockSendEmail.mockResolvedValue({ success: true });

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'unsub-token').run();

      // Create sequence with 1 step
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Single Step Sequence', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 0, 'Only Step', '<p>This is the only step</p>').run();

      // Enroll subscriber
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, oneDayAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify sequence is marked as completed
      const updated = await env.DB.prepare(
        'SELECT * FROM subscriber_sequences WHERE id = ?'
      ).bind(enrollmentId).first();

      expect(updated?.current_step).toBe(1);
      expect(updated?.completed_at).toBeDefined();
      expect(updated?.completed_at).toBeGreaterThan(0);
    });

    it('should not send emails if not due yet', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'unsub-token').run();

      // Create sequence with step delayed by 7 days
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Delayed Sequence', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 7, 'Delayed Step', '<p>This comes after 7 days</p>').run();

      // Enroll subscriber 3 days ago (not yet due)
      const threeDaysAgo = Math.floor(Date.now() / 1000) - (3 * 86400);
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, threeDaysAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify no email was sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should not send emails to inactive subscribers', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Create inactive subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'unsubscribed', 'unsub-token').run();

      // Create sequence
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 0, 'Test', '<p>Test</p>').run();

      // Enroll subscriber
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, oneDayAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify no email was sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should not send emails for inactive sequences', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Create active subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'unsub-token').run();

      // Create inactive sequence
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Inactive Sequence', 0).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 0, 'Test', '<p>Test</p>').run();

      // Enroll subscriber
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, oneDayAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify no email was sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should not send emails for completed sequences', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Create subscriber
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'unsub-token').run();

      // Create sequence
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, is_active)
        VALUES (?, ?, ?)
      `).bind(sequenceId, 'Completed Sequence', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 0, 'Test', '<p>Test</p>').run();

      // Enroll subscriber and mark as completed
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 1, oneDayAgo, oneDayAgo).run();

      // Process sequence emails
      await processSequenceEmails(env);

      // Verify no email was sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('Time-based scheduling', () => {
    it('should not send email before scheduled time', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Setup: subscriber enrolled at 2024-01-01 15:00 JST
      // Step: delay_days=1, delay_time=NULL (uses default_send_time=10:00)
      // Current time: 2024-01-02 09:00 JST (before 10:00)
      // Expected: No email sent

      const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000; // 15:00 JST = 06:00 UTC
      const currentTime = Date.UTC(2024, 0, 2, 0, 0, 0) / 1000; // 09:00 JST = 00:00 UTC

      // Insert test data with default_send_time and delay_time
      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, default_send_time, is_active)
        VALUES (?, ?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', '10:00', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 1, null, 'Test Subject', 'Test Content').run();

      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'token-1').run();

      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, enrolledAt).run();

      // Mock Date.now to return currentTime
      vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

      await processSequenceEmails(env);

      // Verify no email was sent
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should send email at or after scheduled time', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);
      mockSendEmail.mockResolvedValue({ success: true });

      // Setup: subscriber enrolled at 2024-01-01 15:00 JST
      // Step: delay_days=1, default_send_time=10:00
      // Current time: 2024-01-02 10:30 JST (after 10:00)
      // Expected: Email sent

      const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000; // 15:00 JST = 06:00 UTC
      const currentTime = Date.UTC(2024, 0, 2, 1, 30, 0) / 1000; // 10:30 JST = 01:30 UTC

      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, default_send_time, is_active)
        VALUES (?, ?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', '10:00', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 1, null, 'Test Subject', 'Test Content').run();

      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'token-1').run();

      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, enrolledAt).run();

      vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

      await processSequenceEmails(env);

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should use step delay_time over sequence default_send_time', async () => {
      const env = getTestEnv();
      const mockSendEmail = vi.mocked(email.sendEmail);

      // Step has delay_time=18:30, sequence has default_send_time=10:00
      // Current time: 2024-01-02 12:00 JST
      // Expected: No email (18:30 not reached yet)

      const enrolledAt = Date.UTC(2024, 0, 1, 6, 0, 0) / 1000;
      const currentTime = Date.UTC(2024, 0, 2, 3, 0, 0) / 1000; // 12:00 JST = 03:00 UTC

      const sequenceId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequences (id, name, default_send_time, is_active)
        VALUES (?, ?, ?, ?)
      `).bind(sequenceId, 'Test Sequence', '10:00', 1).run();

      const stepId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, subject, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(stepId, sequenceId, 1, 1, '18:30', 'Test Subject', 'Test Content').run();

      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status, unsubscribe_token)
        VALUES (?, ?, ?, ?)
      `).bind(subscriberId, 'test@example.com', 'active', 'token-1').run();

      const enrollmentId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(enrollmentId, subscriberId, sequenceId, 0, enrolledAt).run();

      vi.spyOn(Date, 'now').mockReturnValue(currentTime * 1000);

      await processSequenceEmails(env);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
