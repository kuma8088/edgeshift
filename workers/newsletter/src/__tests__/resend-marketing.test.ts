import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  splitName,
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
  type ResendMarketingConfig,
  type BroadcastOptions,
} from '../lib/resend-marketing';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockConfig(): ResendMarketingConfig {
  return {
    apiKey: 'test-api-key',
    defaultSegmentId: 'test-segment-id',
  };
}

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Resend Marketing API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // splitName() Tests
  // ==========================================================================

  describe('splitName', () => {
    it('should split "John Doe" into firstName and lastName', () => {
      const result = splitName('John Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle single name (no space)', () => {
      const result = splitName('John');
      expect(result).toEqual({ firstName: 'John', lastName: '' });
    });

    it('should handle multiple middle names', () => {
      const result = splitName('John Middle Name Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Middle Name Doe' });
    });

    it('should return empty strings for null input', () => {
      const result = splitName(null);
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should return empty strings for undefined input', () => {
      const result = splitName(undefined);
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should return empty strings for empty string input', () => {
      const result = splitName('');
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should return empty strings for whitespace-only input', () => {
      const result = splitName('   ');
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should trim leading and trailing whitespace', () => {
      const result = splitName('  John Doe  ');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle multiple spaces between names', () => {
      const result = splitName('John    Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });
  });

  // ==========================================================================
  // ensureResendContact() Tests
  // ==========================================================================

  describe('ensureResendContact', () => {
    it('should create a new contact successfully', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'contact-123', object: 'contact' }, 201)
      );

      const result = await ensureResendContact(config, 'test@example.com', 'John Doe');

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-123');
      expect(result.existed).toBe(false);

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/contacts',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            first_name: 'John',
            last_name: 'Doe',
            unsubscribed: false,
          }),
        })
      );
    });

    it('should handle existing contact (409 Conflict)', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Contact already exists' } }, 409)
      );

      const result = await ensureResendContact(config, 'existing@example.com');

      expect(result.success).toBe(true);
      expect(result.existed).toBe(true);
      expect(result.contactId).toBeUndefined();
    });

    it('should handle API error response', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Invalid API key' } }, 401)
      );

      const result = await ensureResendContact(config, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should handle network errors', async () => {
      const config = createMockConfig();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // Retry attempts
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await ensureResendContact(config, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Contact creation error');
    });

    it('should handle contact with no name', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'contact-456', object: 'contact' }, 201)
      );

      const result = await ensureResendContact(config, 'test@example.com');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/contacts',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'test@example.com',
            first_name: '',
            last_name: '',
            unsubscribed: false,
          }),
        })
      );
    });

    it('should handle contact with null name', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'contact-789', object: 'contact' }, 201)
      );

      const result = await ensureResendContact(config, 'test@example.com', null);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/contacts',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'test@example.com',
            first_name: '',
            last_name: '',
            unsubscribed: false,
          }),
        })
      );
    });

    it('should retry on 429 rate limit and succeed', async () => {
      const config = createMockConfig();

      // First call returns 429, second succeeds
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
            status: 429,
            headers: { 'Retry-After': '1' },
          })
        )
        .mockResolvedValueOnce(
          createJsonResponse({ id: 'contact-123', object: 'contact' }, 201)
        );

      const result = await ensureResendContact(config, 'test@example.com', 'Test');

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid JSON response', async () => {
      const config: ResendMarketingConfig = { apiKey: 'test-key' };

      mockFetch.mockResolvedValueOnce(
        new Response('<!DOCTYPE html><html>Error</html>', { status: 200 })
      );

      const result = await ensureResendContact(config, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON response');
    });
  });

  // ==========================================================================
  // createTempSegment() Tests
  // ==========================================================================

  describe('createTempSegment', () => {
    it('should create a segment successfully', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'segment-123' }, 201)
      );

      const result = await createTempSegment(config, 'Campaign 2024-01-15');

      expect(result.success).toBe(true);
      expect(result.segmentId).toBe('segment-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/segments',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Campaign 2024-01-15' }),
        })
      );
    });

    it('should handle API error response', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Segment limit reached' } }, 400)
      );

      const result = await createTempSegment(config, 'Test Segment');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Segment limit reached');
    });

    it('should handle network errors', async () => {
      const config = createMockConfig();
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await createTempSegment(config, 'Test Segment');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Segment creation error');
    });

    it('should handle successful response without ID', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({}, 201)
      );

      const result = await createTempSegment(config, 'Test Segment');

      expect(result.success).toBe(true);
      expect(result.segmentId).toBeUndefined();
    });

    it('should handle invalid JSON response', async () => {
      const config: ResendMarketingConfig = { apiKey: 'test-key' };

      mockFetch.mockResolvedValueOnce(
        new Response('Server Error', { status: 200 })
      );

      const result = await createTempSegment(config, 'Test Segment');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON response');
    });
  });

  // ==========================================================================
  // addContactsToSegment() Tests
  // ==========================================================================

  describe('addContactsToSegment', () => {
    it('should add contacts to segment successfully', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }, 200));
      mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }, 200));

      const result = await addContactsToSegment(
        config,
        'segment-123',
        ['contact-1', 'contact-2']
      );

      expect(result.success).toBe(true);
      expect(result.added).toBe(2);
      expect(result.errors).toHaveLength(0);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Verify correct API endpoint: POST /contacts/:contact_id/segments/:segment_id (path params, no body)
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.resend.com/contacts/contact-1/segments/segment-123',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle partial failures', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }, 200));
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Contact not found' } }, 404)
      );

      const result = await addContactsToSegment(
        config,
        'segment-123',
        ['contact-1', 'contact-2']
      );

      expect(result.success).toBe(false);
      expect(result.added).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('contact-2');
      expect(result.errors[0]).toContain('Contact not found');
    });

    it('should handle network errors for individual contacts', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }, 200));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await addContactsToSegment(
        config,
        'segment-123',
        ['contact-1', 'contact-2']
      );

      expect(result.success).toBe(false);
      expect(result.added).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle empty contactId list', async () => {
      const config = createMockConfig();

      const result = await addContactsToSegment(config, 'segment-123', []);

      expect(result.success).toBe(true);
      expect(result.added).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle all failures', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Error 1' } }, 400)
      );
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Error 2' } }, 400)
      );

      const result = await addContactsToSegment(
        config,
        'segment-123',
        ['contact-1', 'contact-2']
      );

      expect(result.success).toBe(false);
      expect(result.added).toBe(0);
      expect(result.errors).toHaveLength(2);
    });
  });

  // ==========================================================================
  // deleteSegment() Tests
  // ==========================================================================

  describe('deleteSegment', () => {
    it('should delete a segment successfully', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const result = await deleteSegment(config, 'segment-123');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/segments/segment-123',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-api-key',
          },
        })
      );
    });

    it('should handle 404 Not Found (segment already deleted)', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Segment not found' } }, 404)
      );

      const result = await deleteSegment(config, 'non-existent-segment');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Segment not found');
    });

    it('should handle API error response', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Unauthorized' } }, 401)
      );

      const result = await deleteSegment(config, 'segment-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle network errors', async () => {
      const config = createMockConfig();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await deleteSegment(config, 'segment-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Segment deletion error');
    });

    it('should handle response with invalid JSON', async () => {
      const config = createMockConfig();
      // For 500 error with invalid JSON, fetchWithRetry will retry and eventually
      // reach max retries, throwing an error that gets caught
      mockFetch.mockResolvedValueOnce(
        new Response('not json', { status: 500 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response('not json', { status: 500 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response('not json', { status: 500 })
      );

      const result = await deleteSegment(config, 'segment-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Segment deletion error');
    });
  });

  // ==========================================================================
  // createAndSendBroadcast() Tests
  // ==========================================================================

  describe('createAndSendBroadcast', () => {
    const broadcastOptions: BroadcastOptions = {
      segmentId: 'segment-123',
      from: 'Newsletter <newsletter@example.com>',
      subject: 'Test Newsletter',
      html: '<p>Hello World</p>',
      replyTo: 'reply@example.com',
      name: 'January Newsletter',
    };

    it('should create and send a broadcast successfully', async () => {
      const config = createMockConfig();

      // Mock create broadcast response
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'broadcast-123' }, 201)
      );
      // Mock send broadcast response
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'broadcast-123' }, 200)
      );

      const result = await createAndSendBroadcast(config, broadcastOptions);

      expect(result.success).toBe(true);
      expect(result.broadcastId).toBe('broadcast-123');

      // Verify create broadcast call
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.resend.com/broadcasts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            segment_id: 'segment-123',
            from: 'Newsletter <newsletter@example.com>',
            subject: 'Test Newsletter',
            html: '<p>Hello World</p>',
            reply_to: 'reply@example.com',
            name: 'January Newsletter',
          }),
        })
      );

      // Verify send broadcast call
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.resend.com/broadcasts/broadcast-123/send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
          },
        })
      );
    });

    it('should handle create broadcast failure', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Invalid segment' } }, 400)
      );

      const result = await createAndSendBroadcast(config, broadcastOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid segment');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not attempt to send
    });

    it('should handle send broadcast failure', async () => {
      const config = createMockConfig();
      // Mock create broadcast response
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'broadcast-456' }, 201)
      );
      // Mock send broadcast failure
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ error: { message: 'Segment has no contacts' } }, 400)
      );

      const result = await createAndSendBroadcast(config, broadcastOptions);

      expect(result.success).toBe(false);
      expect(result.broadcastId).toBe('broadcast-456');
      expect(result.error).toBe('Segment has no contacts');
    });

    it('should handle create response without broadcast ID', async () => {
      const config = createMockConfig();
      mockFetch.mockResolvedValueOnce(createJsonResponse({}, 201));

      const result = await createAndSendBroadcast(config, broadcastOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Broadcast created but no ID returned');
    });

    it('should handle network errors', async () => {
      const config = createMockConfig();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await createAndSendBroadcast(config, broadcastOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Broadcast error');
    });

    it('should work without optional fields', async () => {
      const config = createMockConfig();
      const minimalOptions: BroadcastOptions = {
        segmentId: 'segment-123',
        from: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      };

      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'broadcast-789' }, 201)
      );
      mockFetch.mockResolvedValueOnce(
        createJsonResponse({ id: 'broadcast-789' }, 200)
      );

      const result = await createAndSendBroadcast(config, minimalOptions);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.resend.com/broadcasts',
        expect.objectContaining({
          body: JSON.stringify({
            segment_id: 'segment-123',
            from: 'test@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
            reply_to: undefined,
            name: undefined,
          }),
        })
      );
    });

    it('should handle invalid JSON response on create', async () => {
      const config: ResendMarketingConfig = { apiKey: 'test-key' };

      mockFetch.mockResolvedValueOnce(
        new Response('Gateway Timeout', { status: 200 })
      );

      const result = await createAndSendBroadcast(config, {
        segmentId: 'seg-123',
        from: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON response');
    });
  });
});
