import { describe, it, expect } from 'vitest';
import { generateExcerpt } from '../lib/excerpt';

describe('generateExcerpt', () => {
  it('should strip HTML tags', () => {
    const html = '<p>This is a <strong>test</strong> with <em>formatting</em>.</p>';
    const result = generateExcerpt(html, 100);

    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('test');
    expect(result).toContain('formatting');
  });

  it('should truncate long text', () => {
    const html = '<p>' + 'A'.repeat(200) + '</p>';
    const result = generateExcerpt(html, 50);

    expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(result).toContain('...');
  });

  it('should not truncate short text', () => {
    const html = '<p>Short text</p>';
    const result = generateExcerpt(html, 100);

    expect(result).toBe('Short text');
    expect(result).not.toContain('...');
  });

  it('should truncate at last space', () => {
    const html = '<p>This is a long sentence that should be truncated at the last space before the limit.</p>';
    const result = generateExcerpt(html, 50);

    // Should end with "..."
    expect(result).toContain('...');
    expect(result.length).toBeLessThanOrEqual(53);
    // The excerpt finds the last space within 50 chars and truncates there
    expect(result).toBe('This is a long sentence that should be truncated...');
  });

  it('should collapse multiple spaces', () => {
    const html = '<p>Multiple    spaces   between    words</p>';
    const result = generateExcerpt(html, 100);

    expect(result).toBe('Multiple spaces between words');
  });

  it('should handle nested tags', () => {
    const html = '<div><p>Nested <span><strong>tags</strong></span> here</p></div>';
    const result = generateExcerpt(html, 100);

    expect(result).toBe('Nested tags here');
  });

  it('should handle empty content', () => {
    const result = generateExcerpt('', 100);
    expect(result).toBe('');
  });

  it('should handle only HTML tags', () => {
    const result = generateExcerpt('<p></p><div></div>', 100);
    expect(result).toBe('');
  });

  it('should use default max length of 150', () => {
    const html = '<p>' + 'A'.repeat(200) + '</p>';
    const result = generateExcerpt(html);

    expect(result.length).toBeLessThanOrEqual(153); // 150 + "..."
  });
});
