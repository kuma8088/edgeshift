import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { createCampaign, getCampaign, listCampaigns, updateCampaign, deleteCampaign, copyCampaign } from '../routes/campaigns';

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
      expect(result.data.slug).toBeDefined();
      expect(result.data.excerpt).toBeDefined();
      expect(result.data.is_published).toBe(0);  // Default unpublished
    });

    it('should auto-generate slug if not provided', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'My Great Newsletter',
          content: '<p>Content</p>',
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.data.slug).toBe('my-great-newsletter');
    });

    it('should use provided slug if given', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Content</p>',
          slug: 'custom-slug',
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.data.slug).toBe('custom-slug');
    });

    it('should auto-generate excerpt if not provided', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Newsletter',
          content: '<p>This is a very long content that should be truncated to a shorter excerpt. It has multiple sentences and HTML tags that should be stripped out.</p>',
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.data.excerpt).toBeDefined();
      expect(result.data.excerpt.length).toBeLessThanOrEqual(153);  // 150 + "..."
      expect(result.data.excerpt).not.toContain('<p>');  // HTML stripped
    });

    it('should handle is_published field', async () => {
      const env = getTestEnv();
      const request = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Published Newsletter',
          content: '<p>Content</p>',
          is_published: true,
        }),
      });

      const response = await createCampaign(request, env);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.data.is_published).toBe(1);
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
      expect(result.data.campaign.id).toBe(campaignId);
      expect(result.data.campaign.subject).toBe('Test Newsletter');
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

    it('should update slug', async () => {
      const env = getTestEnv();

      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Original', content: '<p>Original</p>' }),
      }), env);
      const created = await createRes.json();

      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ slug: 'new-custom-slug' }),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.slug).toBe('new-custom-slug');
    });

    it('should update excerpt', async () => {
      const env = getTestEnv();

      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Test', content: '<p>Original</p>' }),
      }), env);
      const created = await createRes.json();

      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ excerpt: 'Custom excerpt' }),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.excerpt).toBe('Custom excerpt');
    });

    it('should auto-generate excerpt when content is updated without excerpt', async () => {
      const env = getTestEnv();

      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Test', content: '<p>Original</p>' }),
      }), env);
      const created = await createRes.json();

      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ content: '<p>New content that is very long</p>' }),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.excerpt).toContain('New content');
      expect(result.data.excerpt).not.toContain('<p>');
    });

    it('should update is_published', async () => {
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

      expect(created.data.is_published).toBe(0);

      const updateReq = new Request(`http://localhost/api/campaigns/${created.data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ is_published: true }),
      });
      const response = await updateCampaign(updateReq, env, created.data.id);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.is_published).toBe(1);
    });
  });

  describe('deleteCampaign (soft delete)', () => {
    it('should soft delete a draft campaign', async () => {
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

      // Delete the campaign (soft delete)
      const deleteReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, campaignId);

      expect(response.status).toBe(200);

      // Verify it's not visible via API
      const getRes = await getCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, campaignId);
      expect(getRes.status).toBe(404);

      // Verify it still exists in DB with is_deleted = 1
      const dbRecord = await env.DB.prepare('SELECT is_deleted FROM campaigns WHERE id = ?')
        .bind(campaignId).first<{ is_deleted: number }>();
      expect(dbRecord?.is_deleted).toBe(1);
    });

    it('should soft delete a sent campaign', async () => {
      const env = getTestEnv();

      // Create and mark as sent
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Sent Campaign', content: '<p>Sent</p>' }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ? WHERE id = ?")
        .bind(Math.floor(Date.now() / 1000), campaignId).run();

      // Delete the sent campaign (should succeed with soft delete)
      const deleteReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, campaignId);

      expect(response.status).toBe(200);

      // Verify it's not visible via API
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

    it('should return 404 for already deleted campaign', async () => {
      const env = getTestEnv();

      // Create a campaign
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'To Delete Twice', content: '<p>Delete me</p>' }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Delete once
      await deleteCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, campaignId);

      // Try to delete again
      const deleteReq = new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await deleteCampaign(deleteReq, env, campaignId);

      expect(response.status).toBe(404);
    });

    it('should exclude soft-deleted campaigns from list', async () => {
      const env = getTestEnv();

      // Create two campaigns
      const createRes1 = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Keep This', content: '<p>Keep</p>' }),
      }), env);
      const created1 = await createRes1.json();

      const createRes2 = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Delete This', content: '<p>Delete</p>' }),
      }), env);
      const created2 = await createRes2.json();

      // Delete one campaign
      await deleteCampaign(new Request(`http://localhost/api/campaigns/${created2.data.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, created2.data.id);

      // List campaigns
      const listReq = new Request('http://localhost/api/campaigns', {
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const listRes = await listCampaigns(listReq, env);
      const listResult = await listRes.json();

      expect(listResult.data.campaigns).toHaveLength(1);
      expect(listResult.data.campaigns[0].id).toBe(created1.data.id);
      expect(listResult.data.total).toBe(1);
    });

    it('should preserve delivery_logs when soft deleting campaign', async () => {
      const env = getTestEnv();

      // Create a campaign and add a delivery log
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ subject: 'Campaign with logs', content: '<p>Content</p>' }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Create a subscriber first
      const subscriberId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO subscribers (id, email, status)
        VALUES (?, ?, 'active')
      `).bind(subscriberId, 'test@example.com').run();

      // Add a delivery log
      const logId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, sent_at)
        VALUES (?, ?, ?, ?, 'sent', ?)
      `).bind(logId, campaignId, subscriberId, 'test@example.com', Math.floor(Date.now() / 1000)).run();

      // Delete the campaign
      await deleteCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, campaignId);

      // Verify delivery log still exists
      const log = await env.DB.prepare('SELECT * FROM delivery_logs WHERE id = ?')
        .bind(logId).first();
      expect(log).toBeDefined();
      expect(log?.campaign_id).toBe(campaignId);
    });
  });

  describe('copyCampaign', () => {
    it('should copy a campaign with correct fields', async () => {
      const env = getTestEnv();

      // Create a campaign with all fields
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Original Campaign',
          content: '<p>Original content</p>',
          excerpt: 'Original excerpt',
          contact_list_id: 'list-123',
          template_id: 'template-456',
          is_published: true,
        }),
      }), env);
      const created = await createRes.json();
      const originalId = created.data.id;

      // Copy the campaign
      const copyReq = new Request(`http://localhost/api/campaigns/${originalId}/copy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await copyCampaign(copyReq, env, originalId);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);

      // Verify copied fields
      expect(result.data.id).not.toBe(originalId);
      expect(result.data.subject).toBe('[コピー] Original Campaign');
      expect(result.data.content).toBe('<p>Original content</p>');
      expect(result.data.excerpt).toBe('Original excerpt');
      expect(result.data.contact_list_id).toBe('list-123');
      expect(result.data.template_id).toBe('template-456');

      // Verify reset fields
      expect(result.data.status).toBe('draft');
      expect(result.data.scheduled_at).toBeNull();
      expect(result.data.sent_at).toBeNull();
      expect(result.data.is_published).toBe(0);
      expect(result.data.is_deleted).toBe(0);

      // Verify new slug
      expect(result.data.slug).not.toBe(created.data.slug);
      expect(result.data.slug).toContain('original-campaign');
    });

    it('should generate unique slug for copied campaign', async () => {
      const env = getTestEnv();

      // Create a campaign
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Campaign',
          content: '<p>Content</p>',
        }),
      }), env);
      const created = await createRes.json();
      const originalId = created.data.id;

      // Copy the campaign twice
      const copyReq1 = new Request(`http://localhost/api/campaigns/${originalId}/copy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const result1 = await (await copyCampaign(copyReq1, env, originalId)).json();

      const copyReq2 = new Request(`http://localhost/api/campaigns/${originalId}/copy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const result2 = await (await copyCampaign(copyReq2, env, originalId)).json();

      // Verify unique slugs
      expect(result1.data.slug).not.toBe(result2.data.slug);
    });

    it('should return 404 for non-existent campaign', async () => {
      const env = getTestEnv();

      const copyReq = new Request('http://localhost/api/campaigns/non-existent/copy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await copyCampaign(copyReq, env, 'non-existent');

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted campaign', async () => {
      const env = getTestEnv();

      // Create and delete a campaign
      const createRes = await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'To Delete',
          content: '<p>Content</p>',
        }),
      }), env);
      const created = await createRes.json();
      const campaignId = created.data.id;

      // Delete the campaign
      await deleteCampaign(new Request(`http://localhost/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      }), env, campaignId);

      // Try to copy the deleted campaign
      const copyReq = new Request(`http://localhost/api/campaigns/${campaignId}/copy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
      });
      const response = await copyCampaign(copyReq, env, campaignId);

      expect(response.status).toBe(404);
    });

    it('should return 401 if not authorized', async () => {
      const env = getTestEnv();

      const copyReq = new Request('http://localhost/api/campaigns/some-id/copy', {
        method: 'POST',
        // No Authorization header
      });
      const response = await copyCampaign(copyReq, env, 'some-id');

      expect(response.status).toBe(401);
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

  it('should route POST /api/campaigns/:id/copy to copyCampaign', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    // Create a campaign first
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ subject: 'To Copy', content: '<p>Copy me</p>' }),
    });
    const createRes = await worker.fetch(createReq, env);
    const created = await createRes.json();

    // Copy the campaign
    const request = new Request(`http://localhost/api/campaigns/${created.data.id}/copy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.ADMIN_API_KEY}` },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(201);

    const result = await response.json();
    expect(result.data.subject).toBe('[コピー] To Copy');
    expect(result.data.status).toBe('draft');
  });
});
