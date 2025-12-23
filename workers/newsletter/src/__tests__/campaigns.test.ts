import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { createCampaign, getCampaign, listCampaigns, updateCampaign, deleteCampaign } from '../routes/campaigns';

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

  describe('updateCampaign', () => {
    it('should update campaign subject and content', async () => {
      const env = getTestEnv();

      // Create a campaign
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Original', content: '<p>Original</p>' }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Update the campaign
      const updateReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Updated', content: '<p>Updated</p>' }),
      });
      const response = await updateCampaign(updateReq, env, campaignId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.subject).toBe('Updated');
      expect(result.data.content).toBe('<p>Updated</p>');
    });

    it('should return 404 for non-existent campaign', async () => {
      const env = getTestEnv();

      const updateReq = new Request('http://localhost/api/campaigns/non-existent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Updated' }),
      });
      const response = await updateCampaign(updateReq, env, 'non-existent');

      expect(response.status).toBe(404);
    });

    it('should not update sent campaign', async () => {
      const env = getTestEnv();

      // Create and manually set as sent
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Sent', content: '<p>Sent</p>' }),
      }), env);
      const created = await createRes.json();
      await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?")
        .bind(created.data.id).run();

      // Try to update
      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Modified' }),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);

      expect(response.status).toBe(400);
    });

    it('should return 400 if no updates provided', async () => {
      const env = getTestEnv();

      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Test', content: '<p>Test</p>' }),
      }), env);
      const created = await createRes.json();

      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);

      expect(response.status).toBe(400);
    });
  });

  describe('deleteCampaign', () => {
    it('should delete a draft campaign', async () => {
      const env = getTestEnv();

      // Create a campaign
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'To Delete', content: '<p>Delete me</p>' }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Delete the campaign
      const deleteReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, campaignId);

      expect(response.status).toBe(200);

      // Verify it's deleted
      const getRes = await getCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, campaignId);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent campaign', async () => {
      const env = getTestEnv();

      const deleteReq = new Request('http://localhost/api/campaigns/non-existent', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, 'non-existent');

      expect(response.status).toBe(404);
    });

    it('should not delete sent campaign', async () => {
      const env = getTestEnv();

      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Sent', content: '<p>Sent</p>' }),
      }), env);
      const created = await createRes.json();
      await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?")
        .bind(created.data.id).run();

      const deleteReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, created.data.id);

      expect(response.status).toBe(400);
    });
  });
});

describe('Campaign Routes Integration', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should route POST /api/campaigns to createCampaign', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Test', content: '<p>Test</p>' }),
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(201);
  });

  it('should route GET /api/campaigns to listCampaigns', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();
    const request = new Request('http://localhost/api/campaigns', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });

  it('should route GET /api/campaigns/:id to getCampaign', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    // Create a campaign first
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Test', content: '<p>Test</p>' }),
    });
    const createRes = await worker.fetch(createReq, env);
    const created = await createRes.json();

    // Get the campaign
    const request = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });

  it('should route PUT /api/campaigns/:id to updateCampaign', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    // Create a campaign first
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Original', content: '<p>Original</p>' }),
    });
    const createRes = await worker.fetch(createReq, env);
    const created = await createRes.json();

    // Update the campaign
    const request = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'Updated' }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });

  it('should route DELETE /api/campaigns/:id to deleteCampaign', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    // Create a campaign first
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'To Delete', content: '<p>Delete</p>' }),
    });
    const createRes = await worker.fetch(createReq, env);
    const created = await createRes.json();

    // Delete the campaign
    const request = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });
});
