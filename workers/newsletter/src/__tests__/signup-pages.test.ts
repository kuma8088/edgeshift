import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Signup Pages API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/signup-pages', () => {
    it('should return empty list when no pages exist', async () => {
      const env = getTestEnv();
      const { getSignupPagesList } = await import('../routes/signup-pages');

      const result = await getSignupPagesList(env);

      expect(result).toEqual([]);
    });

    it('should return list of active pages ordered by slug', async () => {
      const env = getTestEnv();
      const { createSignupPage, getSignupPagesList } = await import('../routes/signup-pages');

      // Create test pages
      await createSignupPage(env, {
        slug: 'ai-tools',
        title: 'AI Tools',
        content: '<p>AI content</p>',
      });

      await createSignupPage(env, {
        slug: 'backend',
        title: 'Backend',
        content: '<p>Backend content</p>',
      });

      const result = await getSignupPagesList(env);

      expect(result.length).toBe(2);
      expect(result[0].slug).toBe('ai-tools');
      expect(result[1].slug).toBe('backend');
    });

    it('should filter out inactive pages', async () => {
      const env = getTestEnv();
      const { createSignupPage, deleteSignupPage, getSignupPagesList } = await import('../routes/signup-pages');

      // Create active page
      const created = await createSignupPage(env, {
        slug: 'active',
        title: 'Active',
        content: '<p>Active</p>',
      });

      // Delete it (soft delete)
      await deleteSignupPage(env, created.id);

      // List should be empty
      const result = await getSignupPagesList(env);
      expect(result).toEqual([]);
    });
  });

  describe('POST /api/signup-pages', () => {
    it('should create a new signup page with valid data', async () => {
      const env = getTestEnv();
      const { createSignupPage } = await import('../routes/signup-pages');

      const newPage = {
        slug: 'test-page',
        title: 'Test Page',
        content: '<p>Test content</p>',
        meta_title: 'Test Meta',
        meta_description: 'Test meta description',
      };

      const result = await createSignupPage(env, newPage);

      expect(result.id).toBeTruthy();
      expect(result.slug).toBe('test-page');
      expect(result.title).toBe('Test Page');
      expect(result.content).toBe('<p>Test content</p>');
      expect(result.meta_title).toBe('Test Meta');
      expect(result.meta_description).toBe('Test meta description');
      expect(result.is_active).toBe(1);
      expect(result.created_at).toBeTruthy();
      expect(result.updated_at).toBeTruthy();
    });

    it('should reject invalid slug format', async () => {
      const env = getTestEnv();
      const { createSignupPage } = await import('../routes/signup-pages');

      const newPage = {
        slug: 'Invalid_Slug!',
        title: 'Test',
        content: '<p>Test</p>',
      };

      await expect(createSignupPage(env, newPage)).rejects.toThrow('Invalid slug format');
    });

    it('should reject duplicate slug', async () => {
      const env = getTestEnv();
      const { createSignupPage } = await import('../routes/signup-pages');

      const page = {
        slug: 'duplicate',
        title: 'Test',
        content: '<p>Test</p>',
      };

      // Create first
      await createSignupPage(env, page);

      // Try to create duplicate
      await expect(createSignupPage(env, page)).rejects.toThrow('Slug already exists');
    });

    it('should reject non-existent contact_list_id', async () => {
      const env = getTestEnv();
      const { createSignupPage } = await import('../routes/signup-pages');

      const newPage = {
        slug: 'test-contact-list',
        title: 'Test',
        content: '<p>Test</p>',
        contact_list_id: 'non-existent-id',
      };

      await expect(createSignupPage(env, newPage)).rejects.toThrow('Contact list not found');
    });

    it('should accept valid contact_list_id', async () => {
      const env = getTestEnv();
      const { createSignupPage } = await import('../routes/signup-pages');
      const { createContactList } = await import('../routes/contact-lists');

      // Create a valid contact list first
      const contactList = await createContactList(env, {
        name: 'Test List',
        description: 'Test description',
      });

      const newPage = {
        slug: 'test-with-list',
        title: 'Test with List',
        content: '<p>Test</p>',
        contact_list_id: contactList.id,
      };

      const result = await createSignupPage(env, newPage);

      expect(result.id).toBeTruthy();
      expect(result.contact_list_id).toBe(contactList.id);
    });
  });
});
