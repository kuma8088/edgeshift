import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Contact Lists API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('createContactList', () => {
    it('should create a new contact list', async () => {
      const env = getTestEnv();
      const { createContactList } = await import('../routes/contact-lists');

      const result = await createContactList(env, {
        name: 'Tech Blog Readers',
        description: 'Subscribers interested in tech content',
      });

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('Tech Blog Readers');
      expect(result.description).toBe('Subscribers interested in tech content');
      expect(result.created_at).toBeTruthy();
      expect(result.updated_at).toBeTruthy();
    });

    it('should throw error when name is empty', async () => {
      const env = getTestEnv();
      const { createContactList } = await import('../routes/contact-lists');

      await expect(
        createContactList(env, { name: '' })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('getContactLists', () => {
    it('should return empty array when no lists exist', async () => {
      const env = getTestEnv();
      const { getContactLists } = await import('../routes/contact-lists');

      const result = await getContactLists(env);

      expect(result).toEqual([]);
    });

    it('should return all lists ordered by name', async () => {
      const env = getTestEnv();
      const { createContactList, getContactLists } = await import('../routes/contact-lists');

      await createContactList(env, { name: 'Beta List' });
      await createContactList(env, { name: 'Alpha List' });

      const result = await getContactLists(env);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha List');
      expect(result[1].name).toBe('Beta List');
    });
  });

  describe('updateContactList', () => {
    it('should update contact list', async () => {
      const env = getTestEnv();
      const { createContactList, updateContactList } = await import('../routes/contact-lists');

      const created = await createContactList(env, { name: 'Original' });

      // Wait 1 second to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1000));

      const updated = await updateContactList(env, created.id, {
        name: 'Updated',
        description: 'New description',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.description).toBe('New description');
      expect(updated.updated_at).toBeGreaterThan(created.updated_at);
    });

    it('should throw when list not found', async () => {
      const env = getTestEnv();
      const { updateContactList } = await import('../routes/contact-lists');

      await expect(
        updateContactList(env, 'non-existent', { name: 'Test' })
      ).rejects.toThrow('Contact list not found');
    });

    it('should throw when name is empty', async () => {
      const env = getTestEnv();
      const { createContactList, updateContactList } = await import('../routes/contact-lists');

      const created = await createContactList(env, { name: 'Original' });

      await expect(
        updateContactList(env, created.id, { name: '' })
      ).rejects.toThrow('Name cannot be empty');
    });
  });

  describe('deleteContactList', () => {
    it('should delete contact list', async () => {
      const env = getTestEnv();
      const { createContactList, deleteContactList, getContactLists } = await import('../routes/contact-lists');

      const created = await createContactList(env, { name: 'To Delete' });

      await deleteContactList(env, created.id);

      const lists = await getContactLists(env);
      expect(lists).toEqual([]);
    });

    it('should throw when list not found', async () => {
      const env = getTestEnv();
      const { deleteContactList } = await import('../routes/contact-lists');

      await expect(
        deleteContactList(env, 'non-existent')
      ).rejects.toThrow('Contact list not found');
    });
  });

  describe('HTTP Handlers', () => {
    it('GET /api/contact-lists should return 401 without auth', async () => {
      const env = getTestEnv();
      const { handleGetContactLists } = await import('../routes/contact-lists');

      const request = new Request('http://localhost/api/contact-lists', {
        method: 'GET',
      });

      const response = await handleGetContactLists(request, env);
      expect(response.status).toBe(401);
    });

    it('POST /api/contact-lists should require auth', async () => {
      const env = getTestEnv();
      const { handleCreateContactList } = await import('../routes/contact-lists');

      const request = new Request('http://localhost/api/contact-lists', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await handleCreateContactList(request, env);
      expect(response.status).toBe(401);
    });

    it('POST /api/contact-lists should create list with valid auth', async () => {
      const env = getTestEnv();
      const { handleCreateContactList } = await import('../routes/contact-lists');

      const request = new Request('http://localhost/api/contact-lists', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
        body: JSON.stringify({
          name: 'Test List',
          description: 'Test Description',
        }),
      });

      const response = await handleCreateContactList(request, env);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test List');
    });
  });
});
