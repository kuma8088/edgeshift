import { describe, it, expect } from 'vitest';
import { renderEmail, getDefaultBrandSettings } from '../lib/templates';
import type { BrandSettings } from '../types';

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
});
