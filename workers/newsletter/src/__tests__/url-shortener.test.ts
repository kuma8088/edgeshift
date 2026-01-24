import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import {
  generateShortCode,
  extractUrls,
  isExcludedUrl,
  replaceUrlsWithShortened,
  findShortUrlByCode,
  SHORT_URL_BASE,
  CODE_LENGTH,
} from '../lib/url-shortener';

describe('URL Shortener', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('generateShortCode', () => {
    it('should generate 8-character alphanumeric code', () => {
      const code = generateShortCode();

      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateShortCode());
      }

      // All 100 codes should be unique
      expect(codes.size).toBe(100);
    });
  });

  describe('extractUrls', () => {
    it('should extract URLs from <a href="..."> tags', () => {
      const html = `
        <p>Check out <a href="https://example.com/article1">this article</a></p>
        <p>Also see <a href="https://example.com/article2">another one</a></p>
      `;

      const urls = extractUrls(html);

      expect(urls).toHaveLength(2);
      expect(urls[0].url).toBe('https://example.com/article1');
      expect(urls[1].url).toBe('https://example.com/article2');
    });

    it('should return positions of URLs in order (1-indexed)', () => {
      const html = `
        <a href="https://first.com">First</a>
        <a href="https://second.com">Second</a>
        <a href="https://third.com">Third</a>
      `;

      const urls = extractUrls(html);

      expect(urls[0].position).toBe(1);
      expect(urls[1].position).toBe(2);
      expect(urls[2].position).toBe(3);
    });

    it('should handle single-quoted href', () => {
      const html = `<a href='https://example.com'>Link</a>`;

      const urls = extractUrls(html);

      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe('https://example.com');
    });

    it('should return empty array for HTML without links', () => {
      const html = '<p>No links here</p>';

      const urls = extractUrls(html);

      expect(urls).toHaveLength(0);
    });

    it('should handle duplicate URLs at different positions (1-indexed)', () => {
      const html = `
        <a href="https://same.com">First occurrence</a>
        <a href="https://same.com">Second occurrence</a>
      `;

      const urls = extractUrls(html);

      expect(urls).toHaveLength(2);
      expect(urls[0].url).toBe('https://same.com');
      expect(urls[0].position).toBe(1);
      expect(urls[1].url).toBe('https://same.com');
      expect(urls[1].position).toBe(2);
    });
  });

  describe('isExcludedUrl', () => {
    it('should exclude Resend unsubscribe placeholder (CRITICAL: CAN-SPAM)', () => {
      expect(isExcludedUrl('{{{RESEND_UNSUBSCRIBE_URL}}}')).toBe(true);
    });

    it('should exclude mailto: links', () => {
      expect(isExcludedUrl('mailto:test@example.com')).toBe(true);
    });

    it('should exclude tel: links', () => {
      expect(isExcludedUrl('tel:+1234567890')).toBe(true);
    });

    it('should exclude unsubscribe URLs', () => {
      expect(isExcludedUrl('https://edgeshift.tech/api/newsletter/unsubscribe?token=abc')).toBe(true);
      expect(isExcludedUrl('https://example.com/api/newsletter/unsubscribe')).toBe(true);
    });

    it('should not exclude regular http URLs', () => {
      expect(isExcludedUrl('https://example.com/article')).toBe(false);
      expect(isExcludedUrl('http://blog.example.com')).toBe(false);
    });

    it('should not exclude URLs with similar patterns', () => {
      expect(isExcludedUrl('https://example.com/newsletter/archive')).toBe(false);
      expect(isExcludedUrl('https://example.com/subscribe')).toBe(false);
    });
  });

  describe('replaceUrlsWithShortened', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      // Create test campaign and sequence for foreign key constraints
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status)
        VALUES ('camp-1', 'Test Campaign', '<p>Test</p>', 'draft')
      `).run();

      await env.DB.prepare(`
        INSERT INTO sequences (id, name, default_send_time)
        VALUES ('seq-1', 'Test Sequence', '10:00')
      `).run();

      await env.DB.prepare(`
        INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
        VALUES ('step-456', 'seq-1', 1, 0, 'Test Step', '<p>Test</p>')
      `).run();
    });

    it('should replace URLs with shortened versions', async () => {
      const env = getTestEnv();
      const html = '<p>Check <a href="https://example.com/article">this</a> out</p>';

      const result = await replaceUrlsWithShortened(env, html, {});

      expect(result.shortUrls).toHaveLength(1);
      expect(result.html).toContain(SHORT_URL_BASE);
      expect(result.html).not.toContain('https://example.com/article');
    });

    it('should not replace excluded URLs', async () => {
      const env = getTestEnv();
      const html = `
        <p><a href="https://example.com/article">Article</a></p>
        <p><a href="mailto:test@example.com">Email</a></p>
        <p><a href="https://edgeshift.tech/api/newsletter/unsubscribe?token=abc">Unsubscribe</a></p>
      `;

      const result = await replaceUrlsWithShortened(env, html, {});

      // Only the article URL should be shortened
      expect(result.shortUrls).toHaveLength(1);
      expect(result.html).toContain('mailto:test@example.com');
      expect(result.html).toContain('/api/newsletter/unsubscribe');
    });

    it('should create DB records for each shortened URL', async () => {
      const env = getTestEnv();
      const html = `
        <a href="https://example.com/1">One</a>
        <a href="https://example.com/2">Two</a>
      `;

      const result = await replaceUrlsWithShortened(env, html, {
        campaignId: 'camp-1', // Use existing campaign from beforeEach
      });

      expect(result.shortUrls).toHaveLength(2);

      // Verify DB records
      for (const shortUrl of result.shortUrls) {
        const dbRecord = await env.DB.prepare(
          'SELECT * FROM short_urls WHERE short_code = ?'
        ).bind(shortUrl.short_code).first();

        expect(dbRecord).toBeTruthy();
        expect(dbRecord?.campaign_id).toBe('camp-1');
      }
    });

    it('should assign different codes for same URL at different positions (1-indexed)', async () => {
      const env = getTestEnv();
      const html = `
        <a href="https://same.com">First</a>
        <a href="https://same.com">Second</a>
      `;

      const result = await replaceUrlsWithShortened(env, html, {});

      expect(result.shortUrls).toHaveLength(2);
      expect(result.shortUrls[0].short_code).not.toBe(result.shortUrls[1].short_code);
      expect(result.shortUrls[0].position).toBe(1);
      expect(result.shortUrls[1].position).toBe(2);
    });

    it('should handle campaign_id option', async () => {
      const env = getTestEnv();
      const html = '<a href="https://example.com">Link</a>';

      const result = await replaceUrlsWithShortened(env, html, {
        campaignId: 'camp-1', // Use existing campaign from beforeEach
      });

      expect(result.shortUrls[0].campaign_id).toBe('camp-1');
      expect(result.shortUrls[0].sequence_step_id).toBeNull();
    });

    it('should handle sequenceStepId option', async () => {
      const env = getTestEnv();
      const html = '<a href="https://example.com">Link</a>';

      const result = await replaceUrlsWithShortened(env, html, {
        sequenceStepId: 'step-456',
      });

      expect(result.shortUrls[0].sequence_step_id).toBe('step-456');
      expect(result.shortUrls[0].campaign_id).toBeNull();
    });

    it('should return original html if no URLs to shorten', async () => {
      const env = getTestEnv();
      const html = '<p>No links here</p>';

      const result = await replaceUrlsWithShortened(env, html, {});

      expect(result.html).toBe(html);
      expect(result.shortUrls).toHaveLength(0);
    });
  });

  describe('findShortUrlByCode', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      const now = Math.floor(Date.now() / 1000);

      // Create campaign first for foreign key constraint
      await env.DB.prepare(`
        INSERT INTO campaigns (id, subject, content, status)
        VALUES ('camp-1', 'Test Campaign', '<p>Test</p>', 'draft')
      `).run();

      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, campaign_id, created_at)
        VALUES ('url-1', 'ABC12345', 'https://example.com/original', 0, 'camp-1', ?)
      `).bind(now).run();
    });

    it('should find short URL by code', async () => {
      const env = getTestEnv();

      const result = await findShortUrlByCode(env, 'ABC12345');

      expect(result).toBeTruthy();
      expect(result?.original_url).toBe('https://example.com/original');
      expect(result?.campaign_id).toBe('camp-1');
    });

    it('should return null for non-existent code', async () => {
      const env = getTestEnv();

      const result = await findShortUrlByCode(env, 'NOTEXIST');

      expect(result).toBeNull();
    });
  });
});
