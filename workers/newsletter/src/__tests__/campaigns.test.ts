import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { createCampaign, getCampaign, listCampaigns } from '../routes/campaigns';

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

  describe('getCampaign', () => {
    it('should return a campaign by id', async () => {
      const env = getTestEnv();

      // Create a campaign first
      const createReq = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Hello</p>',
        }),
      });
      const createRes = await createCampaign(createReq, env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Get the campaign
      const getReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await getCampaign(getReq, env, campaignId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.id).toBe(campaignId);
      expect(result.data.subject).toBe('Test Newsletter');
    });

    it('should return 404 for non-existent campaign', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns/non-existent', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getCampaign(request, env, 'non-existent');
      expect(response.status).toBe(404);
    });
  });

  describe('listCampaigns', () => {
    it('should return all campaigns', async () => {
      const env = getTestEnv();

      // Create two campaigns
      for (const subject of ['Campaign 1', 'Campaign 2']) {
        await createCampaign(new Request('http://localhost/api/campaigns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          },
          body: JSON.stringify({ subject, content: '<p>Content</p>' }),
        }), env);
      }

      const request = new Request('http://localhost/api/campaigns', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await listCampaigns(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.campaigns).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('should filter by status', async () => {
      const env = getTestEnv();

      // Create a draft campaign
      await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Draft', content: '<p>Draft</p>' }),
      }), env);

      const request = new Request('http://localhost/api/campaigns?status=scheduled', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await listCampaigns(request, env);
      const result = await response.json();

      expect(result.data.campaigns).toHaveLength(0);
    });
  });
});
