import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { getTargetSubscribers, sendCampaignViaBroadcast } from '../lib/broadcast-sender';
import type { Campaign } from '../types';

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
}));

// Mock delivery module
vi.mock('../lib/delivery', () => ({
  recordDeliveryLogs: vi.fn(),
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
import { recordDeliveryLogs } from '../lib/delivery';

const mockedEnsureResendContact = vi.mocked(ensureResendContact);
const mockedCreateTempSegment = vi.mocked(createTempSegment);
const mockedAddContactsToSegment = vi.mocked(addContactsToSegment);
const mockedDeleteSegment = vi.mocked(deleteSegment);
const mockedCreateAndSendBroadcast = vi.mocked(createAndSendBroadcast);
const mockedRecordDeliveryLogs = vi.mocked(recordDeliveryLogs);

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
        ['user1@example.com', 'user2@example.com']
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
      expect(result.error).toBe('Failed to create contacts for all subscribers');
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
  });
});
