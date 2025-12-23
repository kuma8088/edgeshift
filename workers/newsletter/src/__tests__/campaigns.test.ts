import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { createCampaign } from '../routes/campaigns';

describe('Campaign CRUD', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('createCampaign', () => {
    it('should create a draft campaign', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Hello World</p>',
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.status).toBe('draft');
    });

    it('should return 400 if subject is missing', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ content: '<p>Hello</p>' }),
      });

      const response = await createCampaign(request, env);
      expect(response.status).toBe(400);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Test',
          content: '<p>Hello</p>',
        }),
      });

      const response = await createCampaign(request, env);
      expect(response.status).toBe(401);
    });
  });
});
