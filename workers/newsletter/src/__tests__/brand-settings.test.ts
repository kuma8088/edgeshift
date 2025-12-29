import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Brand Settings API', () => {
  const env = getTestEnv();

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/brand-settings', () => {
    it('should return default settings when none exist', async () => {
      const { getBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.primary_color).toBe('#7c3aed');
      expect(data.data.default_template_id).toBe('simple');
    });

    it('should return saved settings', async () => {
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, footer_text)
        VALUES ('default', '#ff0000', 'Custom Footer')
      `).run();

      const { getBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.primary_color).toBe('#ff0000');
      expect(data.data.footer_text).toBe('Custom Footer');
    });
  });

  describe('PUT /api/brand-settings', () => {
    it('should create settings if none exist', async () => {
      const { updateBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary_color: '#00ff00', footer_text: 'New Footer' }),
      });

      const response = await updateBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.primary_color).toBe('#00ff00');
      expect(data.data.footer_text).toBe('New Footer');
    });

    it('should reject unauthorized requests', async () => {
      const { updateBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_color: '#00ff00' }),
      });

      const response = await updateBrandSettings(request, env);
      expect(response.status).toBe(401);
    });
  });
});
