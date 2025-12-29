import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Templates API', () => {
  const env = getTestEnv();

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/templates', () => {
    it('should return list of available templates', async () => {
      const { getTemplates } = await import('../routes/templates');
      const request = new Request('http://localhost/api/templates', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getTemplates(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(5);
      expect(data.data[0]).toHaveProperty('id');
      expect(data.data[0]).toHaveProperty('name');
      expect(data.data[0]).toHaveProperty('description');
    });
  });

  describe('POST /api/templates/preview', () => {
    it('should render preview HTML', async () => {
      const { previewTemplate } = await import('../routes/templates');
      const request = new Request('http://localhost/api/templates/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: 'simple',
          content: 'Hello World',
          subject: 'Test Subject',
        }),
      });

      const response = await previewTemplate(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.html).toContain('Hello World');
      expect(data.data.html).toContain('<!DOCTYPE html>');
    });
  });
});
