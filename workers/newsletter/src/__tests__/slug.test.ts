import { describe, it, expect } from 'vitest';
import { generateSlug, ensureUniqueSlug } from '../lib/slug';

describe('Slug Generation', () => {
  describe('generateSlug', () => {
    it('should convert Japanese to romaji', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null, // No existing slug
          }),
        }),
      };
      const result = await generateSlug(mockDB as any, 'のニュース');
      expect(result).toBe('noniyusu');
    });

    it('should handle English titles', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };
      const result = await generateSlug(mockDB as any, 'Hello World Newsletter');
      expect(result).toBe('hello-world-newsletter');
    });

    it('should remove special characters', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };
      const result = await generateSlug(mockDB as any, 'Tech News #123 @ 2024!');
      expect(result).toBe('tech-news-123-2024');
    });

    it('should truncate to 80 characters', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };
      const longTitle = 'A'.repeat(200);
      const result = await generateSlug(mockDB as any, longTitle);
      expect(result.length).toBeLessThanOrEqual(80);
    });

    it('should lowercase all characters', async () => {
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      };
      const result = await generateSlug(mockDB as any, 'UPPERCASE Title');
      expect(result).toBe('uppercase-title');
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
