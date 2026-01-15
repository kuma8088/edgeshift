import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { getTargetSubscribers, sendCampaignViaBroadcast, sendSequenceStepViaBroadcast } from '../lib/broadcast-sender';
import type { Campaign, SequenceStep, Subscriber } from '../types';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock resend-marketing module
vi.mock('../lib/resend-marketing', () => ({
  ensureResendContact: vi.fn(),
  createTempSegment: vi.fn(),
  addContactsToSegment: vi.fn(),
  deleteSegment: vi.fn(),
  createAndSendBroadcast: vi.fn(),
  // Utility exports for rate limiting
  sleep: vi.fn().mockResolvedValue(undefined),
  RESEND_RATE_LIMIT_DELAY_MS: 550,
}));

// Mock delivery module
vi.mock('../lib/delivery', () => ({
  recordDeliveryLogs: vi.fn(),
  recordSequenceDeliveryLog: vi.fn(),
}));

// Mock templates module - renderEmail only, getDefaultBrandSettings will use real implementation
vi.mock('../lib/templates/index', () => ({
  renderEmail: vi.fn().mockReturnValue('<html><body>Test Email</body></html>'),
  getDefaultBrandSettings: vi.fn().mockReturnValue({
    id: 'default',
    logo_url: null,
    primary_color: '#7c3aed',
    secondary_color: '#1e1e1e',
    footer_text: 'EdgeShift Newsletter',
    default_template_id: 'simple',
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  }),
}));

// Import mocked functions for assertions
import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
} from '../lib/resend-marketing';
import { recordDeliveryLogs, recordSequenceDeliveryLog } from '../lib/delivery';

const mockedEnsureResendContact = vi.mocked(ensureResendContact);
const mockedCreateTempSegment = vi.mocked(createTempSegment);
const mockedAddContactsToSegment = vi.mocked(addContactsToSegment);
const mockedDeleteSegment = vi.mocked(deleteSegment);
const mockedCreateAndSendBroadcast = vi.mocked(createAndSendBroadcast);
const mockedRecordDeliveryLogs = vi.mocked(recordDeliveryLogs);
const mockedRecordSequenceDeliveryLog = vi.mocked(recordSequenceDeliveryLog);

// ============================================================================
// Tests
// ============================================================================

describe('Broadcast Sender', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getTargetSubscribers() Tests
  // ==========================================================================

  describe('getTargetSubscribers', () => {
    it('should return all active subscribers when no contact_list_id', async () => {
      const env = getTestEnv();

      // Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES
          ('sub-1', 'user1@example.com', 'User One', 'active', 'token-1'),
          ('sub-2', 'user2@example.com', 'User Two', 'active', 'token-2'),
          ('sub-3', 'user3@example.com', 'User Three', 'unsubscribed', 'token-3')
      `).run();

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const subscribers = await getTargetSubscribers(campaign, env);

      expect(subscribers).toHaveLength(2);
      expect(subscribers.map((s) => s.email)).toContain('user1@example.com');
      expect(subscribers.map((s) => s.email)).toContain('user2@example.com');
      expect(subscribers.map((s) => s.email)).not.toContain('user3@example.com');
    });

    it('should return only list members when contact_list_id is set', async () => {
      const env = getTestEnv();

      // Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES
          ('sub-1', 'member@example.com', 'Member User', 'active', 'token-1'),
          ('sub-2', 'non-member@example.com', 'Non-Member User', 'active', 'token-2')
      `).run();

      // Create contact list
      await env.DB.prepare(`
        INSERT INTO contact_lists (id, name)
        VALUES ('list-1', 'VIP List')
      `).run();

      // Add only sub-1 to the list
      await env.DB.prepare(`
        INSERT INTO contact_list_members (id, contact_list_id, subscriber_id)
        VALUES ('clm-1', 'list-1', 'sub-1')
      `).run();

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: 'list-1',
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const subscribers = await getTargetSubscribers(campaign, env);

      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].email).toBe('member@example.com');
    });
  });

  // ==========================================================================
  // sendCampaignViaBroadcast() Tests
  // ==========================================================================

  describe('sendCampaignViaBroadcast', () => {
    it('should return error if RESEND_AUDIENCE_ID is not configured', async () => {
      const env = { ...getTestEnv(), RESEND_AUDIENCE_ID: undefined };

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RESEND_AUDIENCE_ID is not configured');
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return error if no active subscribers', async () => {
      const env = getTestEnv();

      // No subscribers in the database

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active subscribers');
    });

    it('should successfully send campaign via broadcast', async () => {
      const env = getTestEnv();

      // Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES
          ('sub-1', 'user1@example.com', 'User One', 'active', 'token-1'),
          ('sub-2', 'user2@example.com', 'User Two', 'active', 'token-2')
      `).run();

      // Create brand settings
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, secondary_color, footer_text, default_template_id)
        VALUES ('default', '#7c3aed', '#1e1e1e', 'EdgeShift Newsletter', 'simple')
      `).run();

      // Setup mocks for successful flow
      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
        existed: false,
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 2,
        errors: [],
      });

      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: true,
        broadcastId: 'broadcast-123',
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(true);
      expect(result.broadcastId).toBe('broadcast-123');
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);

      // Verify the flow
      expect(mockedEnsureResendContact).toHaveBeenCalledTimes(2);
      expect(mockedCreateTempSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'campaign-camp-1'
      );
      expect(mockedAddContactsToSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123',
        ['contact-123', 'contact-123']
      );
      expect(mockedCreateAndSendBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        expect.objectContaining({
          segmentId: 'segment-123',
          subject: 'Test Subject',
        })
      );
      expect(mockedRecordDeliveryLogs).toHaveBeenCalled();
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });

    it('should handle partial contact creation failure', async () => {
      const env = getTestEnv();

      // Create subscribers
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES
          ('sub-1', 'success@example.com', 'Success User', 'active', 'token-1'),
          ('sub-2', 'fail@example.com', 'Fail User', 'active', 'token-2')
      `).run();

      // Create brand settings
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, secondary_color, footer_text, default_template_id)
        VALUES ('default', '#7c3aed', '#1e1e1e', 'EdgeShift Newsletter', 'simple')
      `).run();

      // First contact succeeds, second fails
      mockedEnsureResendContact
        .mockResolvedValueOnce({
          success: true,
          contactId: 'contact-1',
          existed: false,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Invalid email',
        });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 1,
        errors: [],
      });

      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: true,
        broadcastId: 'broadcast-123',
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(2);
      expect(result.results.find((r) => r.email === 'success@example.com')?.success).toBe(true);
      expect(result.results.find((r) => r.email === 'fail@example.com')?.success).toBe(false);
      expect(result.results.find((r) => r.email === 'fail@example.com')?.error).toBe('Invalid email');
    });

    it('should return error if all contact creations fail', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'fail@example.com', 'Fail User', 'active', 'token-1')
      `).run();

      mockedEnsureResendContact.mockResolvedValue({
        success: false,
        error: 'API Error',
      });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get contactIds for any subscribers (existing contacts cannot be added to segments)');
      expect(result.failed).toBe(1);
    });

    it('should cleanup segment on broadcast failure', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'user@example.com', 'User', 'active', 'token-1')
      `).run();

      // Create brand settings
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, secondary_color, footer_text, default_template_id)
        VALUES ('default', '#7c3aed', '#1e1e1e', 'EdgeShift Newsletter', 'simple')
      `).run();

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-1',
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 1,
        errors: [],
      });

      // Broadcast fails
      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: false,
        error: 'Broadcast send failed',
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send broadcast');

      // Segment should still be cleaned up (finally block)
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });

    it('should handle existing contact without contactId from 409 response', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'existing@example.com', 'Existing User', 'active', 'token-1')
      `).run();

      // Mock: contact exists but no contactId returned (409 without ID)
      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        existed: true,
        contactId: undefined,
      });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toContain('existing contacts cannot be added to segments');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('contactId not available');
    });

    it('should handle segment creation failure', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'user@example.com', 'User', 'active', 'token-1')
      `).run();

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-1',
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: false,
        error: 'Segment limit reached',
      });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create segment');
      expect(mockedDeleteSegment).not.toHaveBeenCalled(); // No segment to cleanup
    });

    it('should handle addContactsToSegment failure', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'user@example.com', 'User', 'active', 'token-1')
      `).run();

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-1',
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: false,
        added: 0,
        errors: ['user@example.com: Contact not found'],
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to add contacts to segment');

      // Segment should still be cleaned up (finally block)
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });

    it('should include warning when segment cleanup fails', async () => {
      const env = getTestEnv();

      // Create subscriber
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
        VALUES ('sub-1', 'user@example.com', 'User', 'active', 'token-1')
      `).run();

      // Create brand settings
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, secondary_color, footer_text, default_template_id)
        VALUES ('default', '#7c3aed', '#1e1e1e', 'EdgeShift Newsletter', 'simple')
      `).run();

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 1,
        errors: [],
      });

      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: true,
        broadcastId: 'broadcast-123',
      });

      // Segment deletion fails
      mockedDeleteSegment.mockResolvedValue({ success: false });

      const campaign: Campaign = {
        id: 'camp-1',
        subject: 'Test Subject',
        content: 'Test Content',
        status: 'draft',
        created_at: Math.floor(Date.now() / 1000),
        contact_list_id: null,
        template_id: null,
        scheduled_at: null,
        schedule_type: null,
        schedule_config: null,
        last_sent_at: null,
        sent_at: null,
        recipient_count: null,
        slug: null,
        is_published: 0,
        published_at: null,
        excerpt: null,
        ab_test_enabled: 0,
        ab_subject_b: null,
        ab_from_name_b: null,
        ab_wait_hours: 4,
        ab_test_sent_at: null,
        ab_winner: null,
      };

      const result = await sendCampaignViaBroadcast(campaign, env);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('Segment cleanup failed: segment-123 - manual cleanup may be required');
    });
  });

  // ==========================================================================
  // sendSequenceStepViaBroadcast() Tests
  // ==========================================================================

  describe('sendSequenceStepViaBroadcast', () => {
    const createTestSubscriber = (): Subscriber => ({
      id: 'sub-1',
      email: 'user@example.com',
      name: 'Test User',
      status: 'active',
      confirm_token: null,
      unsubscribe_token: 'unsub-token-1',
      signup_page_slug: null,
      subscribed_at: Math.floor(Date.now() / 1000),
      unsubscribed_at: null,
      created_at: Math.floor(Date.now() / 1000),
      referral_code: null,
      referred_by: null,
      referral_count: 0,
    });

    const createTestSequenceStep = (): SequenceStep => ({
      id: 'step-1',
      sequence_id: 'seq-1',
      step_number: 1,
      delay_days: 0,
      delay_time: '09:00',
      delay_minutes: null,
      subject: 'Welcome to our newsletter!',
      content: 'Thank you for subscribing.',
      template_id: null,
      is_enabled: 1,
      created_at: Math.floor(Date.now() / 1000),
    });

    it('should return error if RESEND_AUDIENCE_ID is not configured', async () => {
      const env = { ...getTestEnv(), RESEND_AUDIENCE_ID: undefined };
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Test</body></html>';

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RESEND_AUDIENCE_ID is not configured');
    });

    it('should successfully send sequence step via broadcast', async () => {
      const env = getTestEnv();
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Welcome!</body></html>';

      // Setup mocks for successful flow
      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
        existed: false,
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 1,
        errors: [],
      });

      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: true,
        broadcastId: 'broadcast-123',
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(true);
      expect(result.broadcastId).toBe('broadcast-123');

      // Verify the flow
      expect(mockedEnsureResendContact).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        subscriber.email,
        subscriber.name
      );

      expect(mockedCreateTempSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        expect.stringContaining(`sequence-${step.sequence_id}-step-${step.step_number}`)
      );

      expect(mockedAddContactsToSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123',
        ['contact-123']
      );

      expect(mockedCreateAndSendBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        expect.objectContaining({
          segmentId: 'segment-123',
          subject: step.subject,
          html,
        })
      );

      // Verify success delivery log was recorded
      expect(mockedRecordSequenceDeliveryLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          sequenceId: step.sequence_id,
          sequenceStepId: step.id,
          subscriberId: subscriber.id,
          email: subscriber.email,
          emailSubject: step.subject,
          resendId: 'broadcast-123',
          status: 'sent',
        })
      );

      // Verify segment cleanup
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });

    it('should record failed delivery log on broadcast failure', async () => {
      const env = getTestEnv();
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Welcome!</body></html>';

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
        existed: false,
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: true,
        added: 1,
        errors: [],
      });

      // Broadcast fails
      mockedCreateAndSendBroadcast.mockResolvedValue({
        success: false,
        error: 'Broadcast send failed',
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send broadcast');

      // Verify failed delivery log was recorded
      expect(mockedRecordSequenceDeliveryLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          sequenceId: step.sequence_id,
          sequenceStepId: step.id,
          subscriberId: subscriber.id,
          email: subscriber.email,
          emailSubject: step.subject,
          status: 'failed',
          errorMessage: 'Broadcast send failed',
        })
      );

      // Segment should still be cleaned up (finally block)
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });

    it('should record failed delivery log on contact creation failure', async () => {
      const env = getTestEnv();
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Welcome!</body></html>';

      mockedEnsureResendContact.mockResolvedValue({
        success: false,
        error: 'Invalid email format',
      });

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to ensure Resend contact');

      // Verify failed delivery log was recorded
      expect(mockedRecordSequenceDeliveryLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          sequenceId: step.sequence_id,
          sequenceStepId: step.id,
          subscriberId: subscriber.id,
          email: subscriber.email,
          emailSubject: step.subject,
          status: 'failed',
          errorMessage: 'Invalid email format',
        })
      );

      // No segment was created, so no cleanup
      expect(mockedDeleteSegment).not.toHaveBeenCalled();
    });

    it('should record failed delivery log on segment creation failure', async () => {
      const env = getTestEnv();
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Welcome!</body></html>';

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
        existed: false,
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: false,
        error: 'Segment limit reached',
      });

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create segment');

      // Verify failed delivery log was recorded
      expect(mockedRecordSequenceDeliveryLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          sequenceId: step.sequence_id,
          sequenceStepId: step.id,
          subscriberId: subscriber.id,
          email: subscriber.email,
          emailSubject: step.subject,
          status: 'failed',
          errorMessage: 'Segment limit reached',
        })
      );

      // No segment was created successfully, so no cleanup
      expect(mockedDeleteSegment).not.toHaveBeenCalled();
    });

    it('should record failed delivery log on add contact to segment failure', async () => {
      const env = getTestEnv();
      const subscriber = createTestSubscriber();
      const step = createTestSequenceStep();
      const html = '<html><body>Welcome!</body></html>';

      mockedEnsureResendContact.mockResolvedValue({
        success: true,
        contactId: 'contact-123',
        existed: false,
      });

      mockedCreateTempSegment.mockResolvedValue({
        success: true,
        segmentId: 'segment-123',
      });

      mockedAddContactsToSegment.mockResolvedValue({
        success: false,
        added: 0,
        errors: ['Contact not found in audience'],
      });

      mockedDeleteSegment.mockResolvedValue({ success: true });

      const result = await sendSequenceStepViaBroadcast(env, subscriber, step, html);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to add contact to segment');

      // Verify failed delivery log was recorded
      expect(mockedRecordSequenceDeliveryLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          sequenceId: step.sequence_id,
          sequenceStepId: step.id,
          subscriberId: subscriber.id,
          email: subscriber.email,
          emailSubject: step.subject,
          status: 'failed',
          errorMessage: expect.stringContaining('Failed to add contact to segment'),
        })
      );

      // Segment should still be cleaned up (finally block)
      expect(mockedDeleteSegment).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
        'segment-123'
      );
    });
  });
});
