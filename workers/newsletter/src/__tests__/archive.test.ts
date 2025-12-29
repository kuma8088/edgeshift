import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { getArchiveList, getArchiveArticle } from '../routes/archive';
import { createCampaign } from '../routes/campaigns';

describe('Archive API', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('getArchiveList', () => {
    it('should return only published campaigns', async () => {
      const env = getTestEnv();

      // Create published campaign
      const publishedReq = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Published Newsletter',
          content: '<p>Published content</p>',
        }),
      });
      const publishedRes = await createCampaign(publishedReq, env);
      const published = await publishedRes.json();

      // Mark as sent (published)
      await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
        .bind(new Date().toISOString(), published.data.id).run();

      // Create draft campaign (should not appear)
      await createCampaign(new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Draft Newsletter',
          content: '<p>Draft content</p>',
        }),
      }), env);

      // Create scheduled campaign (should not appear)
      const scheduledReq = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Scheduled Newsletter',
          content: '<p>Scheduled content</p>',
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      await createCampaign(scheduledReq, env);

      // Test archive list
      const request = new Request('http://localhost/api/archive', {
        method: 'GET',
      });
      const response = await getArchiveList(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.articles).toHaveLength(1);
      expect(result.data.articles[0].subject).toBe('Published Newsletter');
      expect(result.data.total).toBe(1);
    });

    it('should return campaigns sorted by sent_at desc', async () => {
      const env = getTestEnv();

      // Create three campaigns with different sent_at
      const campaigns = [
        { subject: 'First', sentAt: '2024-01-01T00:00:00Z' },
        { subject: 'Third', sentAt: '2024-03-01T00:00:00Z' },
        { subject: 'Second', sentAt: '2024-02-01T00:00:00Z' },
      ];

      for (const campaign of campaigns) {
        const req = new Request('http://localhost/api/campaigns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          },
          body: JSON.stringify({
            subject: campaign.subject,
            content: '<p>Content</p>',
          }),
        });
        const res = await createCampaign(req, env);
        const created = await res.json();

        await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
          .bind(campaign.sentAt, created.data.id).run();
      }

      // Test archive list
      const request = new Request('http://localhost/api/archive');
      const response = await getArchiveList(request, env);
      const result = await response.json();

      expect(result.data.articles).toHaveLength(3);
      expect(result.data.articles[0].subject).toBe('Third');
      expect(result.data.articles[1].subject).toBe('Second');
      expect(result.data.articles[2].subject).toBe('First');
    });

    it('should support pagination', async () => {
      const env = getTestEnv();

      // Create 5 published campaigns
      for (let i = 1; i <= 5; i++) {
        const req = new Request('http://localhost/api/campaigns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
          },
          body: JSON.stringify({
            subject: `Newsletter ${i}`,
            content: '<p>Content</p>',
          }),
        });
        const res = await createCampaign(req, env);
        const created = await res.json();

        await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
          .bind(new Date(Date.now() - i * 1000).toISOString(), created.data.id).run();
      }

      // Page 1 (limit 2, offset 0)
      const page1 = await getArchiveList(
        new Request('http://localhost/api/archive?limit=2&offset=0'),
        env
      );
      const page1Result = await page1.json();

      expect(page1Result.data.articles).toHaveLength(2);
      expect(page1Result.data.total).toBe(5);
      expect(page1Result.data.limit).toBe(2);
      expect(page1Result.data.offset).toBe(0);

      // Page 2 (limit 2, offset 2)
      const page2 = await getArchiveList(
        new Request('http://localhost/api/archive?limit=2&offset=2'),
        env
      );
      const page2Result = await page2.json();

      expect(page2Result.data.articles).toHaveLength(2);
      expect(page2Result.data.total).toBe(5);
      expect(page2Result.data.offset).toBe(2);
    });

    it('should use default pagination if not provided', async () => {
      const env = getTestEnv();

      // Create one campaign
      const req = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Newsletter',
          content: '<p>Content</p>',
        }),
      });
      const res = await createCampaign(req, env);
      const created = await res.json();

      await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
        .bind(new Date().toISOString(), created.data.id).run();

      const request = new Request('http://localhost/api/archive');
      const response = await getArchiveList(request, env);
      const result = await response.json();

      expect(result.data.limit).toBe(20); // default
      expect(result.data.offset).toBe(0);  // default
    });

    it('should return empty array if no published campaigns', async () => {
      const env = getTestEnv();

      const request = new Request('http://localhost/api/archive');
      const response = await getArchiveList(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.articles).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it('should include slug in response', async () => {
      const env = getTestEnv();

      const req = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Content</p>',
        }),
      });
      const res = await createCampaign(req, env);
      const created = await res.json();

      await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
        .bind(new Date().toISOString(), created.data.id).run();

      const request = new Request('http://localhost/api/archive');
      const response = await getArchiveList(request, env);
      const result = await response.json();

      expect(result.data.articles[0].slug).toBeDefined();
      expect(typeof result.data.articles[0].slug).toBe('string');
    });
  });

  describe('getArchiveArticle', () => {
    it('should return article by slug', async () => {
      const env = getTestEnv();

      const req = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Test Newsletter',
          content: '<p>Full content here</p>',
        }),
      });
      const res = await createCampaign(req, env);
      const created = await res.json();
      const campaignId = created.data.id;

      await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
        .bind(new Date().toISOString(), campaignId).run();

      // Get the slug
      const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?')
        .bind(campaignId).first();
      const slug = campaign?.slug;

      const request = new Request(`http://localhost/api/archive/${slug}`);
      const response = await getArchiveArticle(request, env, slug);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.article.id).toBe(campaignId);
      expect(result.data.article.subject).toBe('Test Newsletter');
      expect(result.data.article.content).toBe('<p>Full content here</p>');
      expect(result.data.article.slug).toBe(slug);
    });

    it('should return 404 for non-existent slug', async () => {
      const env = getTestEnv();

      const request = new Request('http://localhost/api/archive/non-existent-slug');
      const response = await getArchiveArticle(request, env, 'non-existent-slug');

      expect(response.status).toBe(404);
    });

    it('should return 404 for unpublished campaign', async () => {
      const env = getTestEnv();

      const req = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Draft Newsletter',
          content: '<p>Draft content</p>',
        }),
      });
      const res = await createCampaign(req, env);
      const created = await res.json();

      // Get the slug
      const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?')
        .bind(created.data.id).first();
      const slug = campaign?.slug;

      const request = new Request(`http://localhost/api/archive/${slug}`);
      const response = await getArchiveArticle(request, env, slug);

      expect(response.status).toBe(404);
    });

    it('should return 404 for scheduled campaign', async () => {
      const env = getTestEnv();

      const req = new Request('http://localhost/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
        },
        body: JSON.stringify({
          subject: 'Scheduled Newsletter',
          content: '<p>Scheduled content</p>',
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      const res = await createCampaign(req, env);
      const created = await res.json();

      const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?')
        .bind(created.data.id).first();
      const slug = campaign?.slug;

      const request = new Request(`http://localhost/api/archive/${slug}`);
      const response = await getArchiveArticle(request, env, slug);

      expect(response.status).toBe(404);
    });
  });
});

describe('Archive Routes Integration', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should route GET /api/archive to getArchiveList', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    const request = new Request('http://localhost/api/archive', {
      method: 'GET',
    });
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
  });

  it('should route GET /api/archive/:slug to getArchiveArticle', async () => {
    const worker = (await import('../index')).default;
    const env = getTestEnv();

    // Create a published campaign
    const createReq = new Request('http://localhost/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.ADMIN_API_KEY}`,
      },
      body: JSON.stringify({
        subject: 'Test',
        content: '<p>Test</p>',
      }),
    });
    const createRes = await worker.fetch(createReq, env);
    const created = await createRes.json();

    await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, is_published = 1 WHERE id = ?")
      .bind(new Date().toISOString(), created.data.id).run();

    const campaign = await env.DB.prepare('SELECT slug FROM campaigns WHERE id = ?')
      .bind(created.data.id).first();

    const request = new Request(`http://localhost/api/archive/${campaign?.slug}`);
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
  });
});
