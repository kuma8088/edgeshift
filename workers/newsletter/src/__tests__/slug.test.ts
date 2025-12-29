import { describe, it, expect } from 'vitest';
import { generateSlug, ensureUniqueSlug } from '../lib/slug';

describe('Slug Generation', () => {
  describe('generateSlug', () => {
    it('should convert Japanese to romaji with date prefix', () => {
      const result = generateSlug('のニュース', new Date('2024-01-15'));
      expect(result).toBe('2024-01-noniyusu');
    });

    it('should handle English titles', () => {
      const result = generateSlug('Hello World Newsletter', new Date('2024-01-15'));
      expect(result).toBe('2024-01-hello-world-newsletter');
    });

    it('should remove special characters', () => {
      const result = generateSlug('Tech News #123 @ 2024!', new Date('2024-01-15'));
      expect(result).toBe('2024-01-tech-news-123-2024');
    });

    it('should truncate to 100 characters', () => {
      const longTitle = 'A'.repeat(200);
      const result = generateSlug(longTitle, new Date('2024-01-15'));
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should lowercase all characters', () => {
      const result = generateSlug('UPPERCASE Title', new Date('2024-01-15'));
      expect(result).toBe('2024-01-uppercase-title');
    });
  });

  describe('ensureUniqueSlug', () => {
    it('should return original slug if not exists', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };

      const result = await ensureUniqueSlug('test-slug', mockDB as any);
      expect(result).toBe('test-slug');
    });

    it('should append -2 if slug exists', async () => {
      const mockDB = {
        prepare: () => ({
          bind: (slug: string) => ({
            first: async () => (slug === 'test-slug' ? { slug } : null),
          }),
        }),
      };

      const result = await ensureUniqueSlug('test-slug', mockDB as any);
      expect(result).toBe('test-slug-2');
    });
  });
});
