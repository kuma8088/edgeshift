import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { handleSubscribe } from '../routes/subscribe';
import { handleConfirm } from '../routes/confirm';

// Mock email sending
vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Turnstile verification
vi.mock('../lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Resend Marketing API
vi.mock('../lib/resend-marketing', () => ({
  ensureResendContact: vi.fn().mockResolvedValue({
    success: true,
    contactId: 'test-contact-id',
    existed: false,
  }),
  addContactsToSegment: vi.fn().mockResolvedValue({
    success: true,
    added: 1,
    errors: [],
  }),
}));

describe('Contact List Auto-Assignment', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.clearAllMocks();
  });

  it('should add subscriber to contact list when signup page has contact_list_id', async () => {
    const env = getTestEnv();
    const { createContactList } = await import('../routes/contact-lists');
    const { createSignupPage } = await import('../routes/signup-pages');

    // Create contact list
    const list = await createContactList(env, { name: 'Tech Newsletter' });

    // Create signup page with contact_list_id
    const page = await createSignupPage(env, {
      slug: 'tech-newsletter',
      title: 'Tech Newsletter',
      content: 'Subscribe to tech updates',
      contact_list_id: list.id,
    });

    // Subscribe
    const subResponse = await handleSubscribe(
      new Request('http://localhost/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          signupPageSlug: 'tech-newsletter',
          turnstileToken: 'test-token',
        }),
      }),
      env
    );

    expect(subResponse.status).toBe(201);

    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE email = 'test@example.com'"
    ).first();

    expect(subscriber).toBeTruthy();
    expect(subscriber.signup_page_slug).toBe('tech-newsletter');

    // Confirm subscription
    await handleConfirm(
      new Request(`http://localhost/api/newsletter/confirm/${subscriber.confirm_token}`),
      env,
      subscriber.confirm_token
    );

    // Verify subscriber was added to contact list
    const membership = await env.DB.prepare(
      'SELECT * FROM contact_list_members WHERE subscriber_id = ? AND contact_list_id = ?'
    ).bind(subscriber.id, list.id).first();

    expect(membership).toBeTruthy();
  });

  it('should NOT add subscriber to contact list when signup page has no contact_list_id', async () => {
    const env = getTestEnv();
    const { createSignupPage } = await import('../routes/signup-pages');

    // Create signup page WITHOUT contact_list_id
    await createSignupPage(env, {
      slug: 'basic-newsletter',
      title: 'Basic Newsletter',
      content: 'Subscribe',
    });

    // Subscribe
    await handleSubscribe(
      new Request('http://localhost/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test2@example.com',
          signupPageSlug: 'basic-newsletter',
          turnstileToken: 'test-token',
        }),
      }),
      env
    );

    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE email = 'test2@example.com'"
    ).first();

    // Confirm subscription
    await handleConfirm(
      new Request(`http://localhost/api/newsletter/confirm/${subscriber.confirm_token}`),
      env,
      subscriber.confirm_token
    );

    // Verify NO membership was created
    const memberships = await env.DB.prepare(
      'SELECT * FROM contact_list_members WHERE subscriber_id = ?'
    ).bind(subscriber.id).all();

    expect(memberships.results).toHaveLength(0);
  });

  it('should handle missing signup page gracefully', async () => {
    const env = getTestEnv();

    // Subscribe with non-existent signup page
    await handleSubscribe(
      new Request('http://localhost/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test3@example.com',
          signupPageSlug: 'non-existent-page',
          turnstileToken: 'test-token',
        }),
      }),
      env
    );

    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE email = 'test3@example.com'"
    ).first();

    // Confirm subscription (should not throw error)
    const response = await handleConfirm(
      new Request(`http://localhost/api/newsletter/confirm/${subscriber.confirm_token}`),
      env,
      subscriber.confirm_token
    );

    expect(response.status).toBe(302); // Redirect

    // Verify subscriber is active
    const updated = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(subscriber.id).first();

    expect(updated.status).toBe('active');
  });

  it('should sync new subscriber to Resend Segment on confirmation', async () => {
    const env = getTestEnv();
    const { ensureResendContact, addContactsToSegment } = await import('../lib/resend-marketing');
    const mockedEnsureResendContact = vi.mocked(ensureResendContact);
    const mockedAddContactsToSegment = vi.mocked(addContactsToSegment);

    // Subscribe
    await handleSubscribe(
      new Request('http://localhost/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: 'newsub@example.com',
          name: 'New Subscriber',
          turnstileToken: 'test-token',
        }),
      }),
      env
    );

    const subscriber = await env.DB.prepare(
      "SELECT * FROM subscribers WHERE email = 'newsub@example.com'"
    ).first();

    expect(subscriber).toBeTruthy();
    expect(subscriber.status).toBe('pending');

    // Clear mocks before confirm
    mockedEnsureResendContact.mockClear();
    mockedAddContactsToSegment.mockClear();

    // Confirm subscription
    await handleConfirm(
      new Request(`http://localhost/api/newsletter/confirm/${subscriber.confirm_token}`),
      env,
      subscriber.confirm_token
    );

    // Verify Resend Contact was created
    expect(mockedEnsureResendContact).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
      'newsub@example.com',
      'New Subscriber'
    );

    // Verify contact was added to Segment
    expect(mockedAddContactsToSegment).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: env.RESEND_API_KEY }),
      env.RESEND_SEGMENT_ID,
      ['test-contact-id']
    );

    // Verify subscriber is now active
    const updated = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(subscriber.id).first();

    expect(updated.status).toBe('active');
  });
});
