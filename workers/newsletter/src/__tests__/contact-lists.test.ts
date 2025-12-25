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

  describe('Member Management (List Perspective)', () => {
    it('should add subscribers to list', async () => {
      const env = getTestEnv();
      const { createContactList, addMembers, getListMembers } = await import('../routes/contact-lists');

      const list = await createContactList(env, { name: 'Test List' });

      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
      ).bind('sub1', 'user1@example.com', 'active', Math.floor(Date.now() / 1000), 'sub2', 'user2@example.com', 'active', Math.floor(Date.now() / 1000)).run();

      await addMembers(env, list.id, { subscriber_ids: ['sub1', 'sub2'] });

      const members = await getListMembers(env, list.id);
      expect(members).toHaveLength(2);
      expect(members.map(m => m.subscriber_id)).toEqual(expect.arrayContaining(['sub1', 'sub2']));
    });

    it('should handle adding duplicate members idempotently', async () => {
      const env = getTestEnv();
      const { createContactList, addMembers, getListMembers } = await import('../routes/contact-lists');

      const list = await createContactList(env, { name: 'Test List' });
      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status, created_at) VALUES (?, ?, ?, ?)'
      ).bind('sub1', 'user1@example.com', 'active', Math.floor(Date.now() / 1000)).run();

      await addMembers(env, list.id, { subscriber_ids: ['sub1'] });
      await addMembers(env, list.id, { subscriber_ids: ['sub1'] }); // Add again - should not error

      const members = await getListMembers(env, list.id);
      expect(members).toHaveLength(1); // Still only 1 member due to UNIQUE constraint
    });

    it('should remove member from list', async () => {
      const env = getTestEnv();
      const { createContactList, addMembers, removeMember, getListMembers } = await import('../routes/contact-lists');

      const list = await createContactList(env, { name: 'Test List' });
      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status, created_at) VALUES (?, ?, ?, ?)'
      ).bind('sub1', 'user1@example.com', 'active', Math.floor(Date.now() / 1000)).run();

      await addMembers(env, list.id, { subscriber_ids: ['sub1'] });
      await removeMember(env, list.id, 'sub1');

      const members = await getListMembers(env, list.id);
      expect(members).toHaveLength(0);
    });

    it('should throw when adding to non-existent list', async () => {
      const env = getTestEnv();
      const { addMembers } = await import('../routes/contact-lists');

      await expect(
        addMembers(env, 'non-existent', { subscriber_ids: ['sub1'] })
      ).rejects.toThrow('Contact list not found');
    });

    it('should throw when removing non-existent member', async () => {
      const env = getTestEnv();
      const { createContactList, removeMember } = await import('../routes/contact-lists');

      const list = await createContactList(env, { name: 'Test List' });

      await expect(
        removeMember(env, list.id, 'non-existent')
      ).rejects.toThrow('Member not found in list');
    });
  });

  describe('Member Management (Subscriber Perspective)', () => {
    it('should get subscriber lists', async () => {
      const env = getTestEnv();
      const { createContactList, addMembers, getSubscriberLists } = await import('../routes/contact-lists');

      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status, created_at) VALUES (?, ?, ?, ?)'
      ).bind('sub1', 'user@example.com', 'active', Math.floor(Date.now() / 1000)).run();

      const list1 = await createContactList(env, { name: 'List 1' });
      const list2 = await createContactList(env, { name: 'List 2' });

      await addMembers(env, list1.id, { subscriber_ids: ['sub1'] });
      await addMembers(env, list2.id, { subscriber_ids: ['sub1'] });

      const lists = await getSubscriberLists(env, 'sub1');
      expect(lists).toHaveLength(2);
      expect(lists.map(l => l.name)).toEqual(expect.arrayContaining(['List 1', 'List 2']));
    });

    it('should add and remove subscriber from list', async () => {
      const env = getTestEnv();
      const { createContactList, addSubscriberToList, removeSubscriberFromList, getSubscriberLists } = await import('../routes/contact-lists');

      await env.DB.prepare(
        'INSERT INTO subscribers (id, email, status, created_at) VALUES (?, ?, ?, ?)'
      ).bind('sub1', 'user@example.com', 'active', Math.floor(Date.now() / 1000)).run();

      const list = await createContactList(env, { name: 'Test' });

      await addSubscriberToList(env, 'sub1', list.id);
      let lists = await getSubscriberLists(env, 'sub1');
      expect(lists).toHaveLength(1);

      await removeSubscriberFromList(env, 'sub1', list.id);
      lists = await getSubscriberLists(env, 'sub1');
      expect(lists).toHaveLength(0);
    });

    it('should throw when adding subscriber to non-existent list', async () => {
      const env = getTestEnv();
      const { addSubscriberToList } = await import('../routes/contact-lists');

      await expect(
        addSubscriberToList(env, 'sub1', 'non-existent')
      ).rejects.toThrow('Contact list not found');
    });

    it('should throw when removing subscriber from list they are not in', async () => {
      const env = getTestEnv();
      const { createContactList, removeSubscriberFromList } = await import('../routes/contact-lists');

      const list = await createContactList(env, { name: 'Test' });

      await expect(
        removeSubscriberFromList(env, 'sub1', list.id)
      ).rejects.toThrow('Subscriber not in list');
    });
  });
});
