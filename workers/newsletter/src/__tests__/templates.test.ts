import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderEmail, renderEmailAsync, getDefaultBrandSettings } from '../lib/templates';
import type { BrandSettings, Env } from '../types';
import { setupTestDb, cleanupTestDb, getTestEnv } from './setup';
import * as urlShortener from '../lib/url-shortener';

describe('Template Engine', () => {
  const defaultBrandSettings: BrandSettings = {
    id: 'default',
    logo_url: null,
    primary_color: '#7c3aed',
    secondary_color: '#1e1e1e',
    footer_text: 'EdgeShift Newsletter',
    email_signature: '',
    default_template_id: 'simple',
    created_at: 0,
    updated_at: 0,
  };

  describe('renderEmail', () => {
    it('should render simple template with brand settings', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'Hello World',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('Hello World');
      expect(html).toContain('#7c3aed');
      expect(html).toContain('EdgeShift Newsletter');
      expect(html).toContain('http://example.com/unsub');
    });

    it('should replace {{subscriber.name}} variable', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'こんにちは、{{subscriber.name}}さん',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: '田中', email: 'tanaka@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('こんにちは、田中さん');
      expect(html).not.toContain('{{subscriber.name}}');
    });

    it('should replace {{unsubscribe_url}} variable and linkify it', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'Unsubscribe: {{unsubscribe_url}}',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub/abc123',
        siteUrl: 'http://example.com',
      });

      // URL should be converted to a clickable link by linkifyUrls
      expect(html).toContain('Unsubscribe:');
      expect(html).toContain('href="http://example.com/unsub/abc123"');
    });

    it('should apply primary_color to links', () => {
      const customSettings = { ...defaultBrandSettings, primary_color: '#ff0000' };
      const html = renderEmail({
        templateId: 'simple',
        content: 'Test',
        subject: 'Test',
        brandSettings: customSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('#ff0000');
    });

    it('should include footer_text', () => {
      const customSettings = { ...defaultBrandSettings, footer_text: 'My Newsletter' };
      const html = renderEmail({
        templateId: 'simple',
        content: 'Test',
        subject: 'Test',
        brandSettings: customSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('My Newsletter');
    });

    it('should fallback to simple when template not found', () => {
      const html = renderEmail({
        templateId: 'nonexistent' as any,
        content: 'Test Content',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('Test Content');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('getDefaultBrandSettings', () => {
    it('should return default values', () => {
      const settings = getDefaultBrandSettings();
      expect(settings.primary_color).toBe('#7c3aed');
      expect(settings.secondary_color).toBe('#1e1e1e');
      expect(settings.footer_text).toBe('EdgeShift Newsletter');
      expect(settings.default_template_id).toBe('simple');
    });
  });

  describe('renderEmailAsync', () => {
    let testEnv: Env;

    beforeEach(async () => {
      testEnv = getTestEnv() as unknown as Env;
      await setupTestDb();
    });

    afterEach(async () => {
      await cleanupTestDb();
      vi.restoreAllMocks();
    });

    it('should return same HTML as renderEmail when shortenUrls option is not provided', async () => {
      const options = {
        templateId: 'simple',
        content: '<p>Hello World</p>',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      };

      const syncHtml = renderEmail(options);
      const asyncHtml = await renderEmailAsync(options);

      expect(asyncHtml).toBe(syncHtml);
    });

    it('should shorten URLs when shortenUrls option is provided', async () => {
      // Create a campaign to satisfy foreign key constraint
      const campaignId = 'test-campaign-123';
      await testEnv.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, slug)
        VALUES (?, 'Test', 'Content', 'test-slug')
      `).bind(campaignId).run();

      const options = {
        templateId: 'simple',
        content: '<p>Check out <a href="https://example.com/article">this article</a></p>',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
        shortenUrls: {
          env: testEnv,
          campaignId,
        },
      };

      const html = await renderEmailAsync(options);

      // Should contain short URL pattern instead of original URL
      expect(html).toContain('https://edgeshift.tech/r/');
      expect(html).not.toContain('href="https://example.com/article"');
    });

    it('should not shorten unsubscribe URLs', async () => {
      // Create a campaign to satisfy foreign key constraint
      const campaignId = 'test-campaign-456';
      await testEnv.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, slug)
        VALUES (?, 'Test', 'Content', 'test-slug-2')
      `).bind(campaignId).run();

      const options = {
        templateId: 'simple',
        content: '<p>Content here</p>',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/api/newsletter/unsubscribe/abc123',
        siteUrl: 'http://example.com',
        shortenUrls: {
          env: testEnv,
          campaignId,
        },
      };

      const html = await renderEmailAsync(options);

      // Unsubscribe URL should NOT be shortened
      expect(html).toContain('http://example.com/api/newsletter/unsubscribe/abc123');
    });

    it('should pass campaignId to replaceUrlsWithShortened', async () => {
      // Mock replaceUrlsWithShortened to avoid DB operations
      const spy = vi.spyOn(urlShortener, 'replaceUrlsWithShortened').mockResolvedValue({
        html: '<p>mocked</p>',
        shortUrls: [],
      });

      const options = {
        templateId: 'simple',
        content: '<p>Check out <a href="https://example.com/page">this page</a></p>',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
        shortenUrls: {
          env: testEnv,
          campaignId: 'campaign-abc',
        },
      };

      await renderEmailAsync(options);

      expect(spy).toHaveBeenCalledWith(
        testEnv,
        expect.any(String),
        { campaignId: 'campaign-abc', sequenceStepId: undefined }
      );
    });

    it('should pass sequenceStepId to replaceUrlsWithShortened', async () => {
      // Mock replaceUrlsWithShortened to avoid DB operations
      const spy = vi.spyOn(urlShortener, 'replaceUrlsWithShortened').mockResolvedValue({
        html: '<p>mocked</p>',
        shortUrls: [],
      });

      const options = {
        templateId: 'simple',
        content: '<p>Check out <a href="https://example.com/page">this page</a></p>',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
        shortenUrls: {
          env: testEnv,
          sequenceStepId: 'step-xyz',
        },
      };

      await renderEmailAsync(options);

      expect(spy).toHaveBeenCalledWith(
        testEnv,
        expect.any(String),
        { campaignId: undefined, sequenceStepId: 'step-xyz' }
      );
    });
  });
});
