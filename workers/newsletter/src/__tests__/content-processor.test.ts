import { describe, it, expect } from 'vitest';
import {
  extractYoutubeVideoId,
  isYoutubeUrl,
  youtubeUrlToThumbnail,
  convertYoutubeAnchors,
  convertYoutubeUrls,
  linkifyUrls,
  ensureImageMaxWidth,
} from '../lib/content-processor';

describe('Content Processor', () => {
  describe('extractYoutubeVideoId', () => {
    it('should extract video ID from standard watch URL', () => {
      const result = extractYoutubeVideoId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL with additional params', () => {
      const result = extractYoutubeVideoId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s'
      );
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be short URL', () => {
      const result = extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ');
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be URL with params', () => {
      const result = extractYoutubeVideoId(
        'https://youtu.be/dQw4w9WgXcQ?t=30'
      );
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from embed URL', () => {
      const result = extractYoutubeVideoId(
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from embed URL with params', () => {
      const result = extractYoutubeVideoId(
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1'
      );
      expect(result).toBe('dQw4w9WgXcQ');
    });

    it('should return null for non-YouTube URL', () => {
      const result = extractYoutubeVideoId('https://vimeo.com/123456789');
      expect(result).toBeNull();
    });

    it('should return null for invalid URL', () => {
      const result = extractYoutubeVideoId('not-a-url');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = extractYoutubeVideoId('');
      expect(result).toBeNull();
    });

    it('should handle URL without www', () => {
      const result = extractYoutubeVideoId(
        'https://youtube.com/watch?v=abc123XYZ_-'
      );
      expect(result).toBe('abc123XYZ_-');
    });

    it('should handle video ID with special characters (underscore, hyphen)', () => {
      const result = extractYoutubeVideoId(
        'https://www.youtube.com/watch?v=a_b-c1234567'
      );
      expect(result).toBe('a_b-c1234567');
    });
  });

  describe('isYoutubeUrl', () => {
    it('should return true for valid YouTube watch URL', () => {
      expect(isYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        true
      );
    });

    it('should return true for youtu.be URL', () => {
      expect(isYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('should return true for embed URL', () => {
      expect(isYoutubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        true
      );
    });

    it('should return false for non-YouTube URL', () => {
      expect(isYoutubeUrl('https://vimeo.com/123456789')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isYoutubeUrl('')).toBe(false);
    });

    it('should return false for YouTube homepage without video ID', () => {
      expect(isYoutubeUrl('https://www.youtube.com/')).toBe(false);
    });

    it('should return false for YouTube channel URL', () => {
      expect(isYoutubeUrl('https://www.youtube.com/@channelname')).toBe(false);
    });
  });

  describe('youtubeUrlToThumbnail', () => {
    it('should convert YouTube URL to thumbnail HTML', () => {
      const result = youtubeUrlToThumbnail(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result).toContain(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
      expect(result).toContain(
        'href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"'
      );
      expect(result).toContain('<a href=');
      expect(result).toContain('<img src=');
      expect(result).toContain('target="_blank"');
    });

    it('should return original URL for invalid YouTube URL', () => {
      const result = youtubeUrlToThumbnail('https://example.com/video');
      expect(result).toBe('https://example.com/video');
    });

    it('should return original URL for non-URL input', () => {
      const result = youtubeUrlToThumbnail('not-a-url');
      expect(result).toBe('not-a-url');
    });

    it('should include alt text for accessibility', () => {
      const result = youtubeUrlToThumbnail(
        'https://youtu.be/dQw4w9WgXcQ'
      );
      expect(result).toContain('alt="YouTube video thumbnail"');
    });
  });

  describe('convertYoutubeAnchors', () => {
    it('should convert anchor tag with YouTube URL to thumbnail', () => {
      const html =
        '<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Click here</a>';
      const result = convertYoutubeAnchors(html);
      expect(result).toContain(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
      expect(result).toContain('<img src=');
    });

    it('should convert anchor tag with youtu.be URL to thumbnail', () => {
      const html = '<a href="https://youtu.be/abc123">Watch video</a>';
      const result = convertYoutubeAnchors(html);
      expect(result).toContain('https://img.youtube.com/vi/abc123/maxresdefault.jpg');
    });

    it('should preserve non-YouTube anchor tags', () => {
      const html =
        '<a href="https://example.com">Example</a>';
      const result = convertYoutubeAnchors(html);
      expect(result).toBe(html);
    });

    it('should handle multiple YouTube anchors', () => {
      const html = `
        <a href="https://www.youtube.com/watch?v=video1">Video 1</a>
        <p>Some text</p>
        <a href="https://youtu.be/video2">Video 2</a>
      `;
      const result = convertYoutubeAnchors(html);
      expect(result).toContain('https://img.youtube.com/vi/video1/maxresdefault.jpg');
      expect(result).toContain('https://img.youtube.com/vi/video2/maxresdefault.jpg');
    });

    it('should handle mixed YouTube and non-YouTube anchors', () => {
      const html = `
        <a href="https://www.youtube.com/watch?v=ytVideo">YouTube</a>
        <a href="https://example.com">Example</a>
      `;
      const result = convertYoutubeAnchors(html);
      expect(result).toContain('https://img.youtube.com/vi/ytVideo/maxresdefault.jpg');
      expect(result).toContain('href="https://example.com"');
    });
  });

  describe('convertYoutubeUrls', () => {
    it('should convert standalone YouTube URL to thumbnail', () => {
      const text = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const result = convertYoutubeUrls(text);
      expect(result).toContain('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    });

    it('should convert youtu.be URL to thumbnail', () => {
      const text = 'Video: https://youtu.be/abc123';
      const result = convertYoutubeUrls(text);
      expect(result).toContain('https://img.youtube.com/vi/abc123/maxresdefault.jpg');
    });

    it('should not convert URL already inside href attribute', () => {
      const html =
        '<a href="https://www.youtube.com/watch?v=test">link</a>';
      const result = convertYoutubeUrls(html);
      // Should not add another thumbnail
      expect(result).toBe(html);
    });

    it('should handle URL followed by Japanese punctuation', () => {
      const text = 'この動画を見てください。https://youtu.be/video123。おすすめです';
      const result = convertYoutubeUrls(text);
      expect(result).toContain('https://img.youtube.com/vi/video123/maxresdefault.jpg');
      // Japanese period should be preserved outside the URL
      expect(result).toContain('。おすすめです');
    });

    it('should handle URL followed by Japanese comma', () => {
      const text = 'https://youtu.be/video123、これがおすすめ';
      const result = convertYoutubeUrls(text);
      expect(result).toContain('https://img.youtube.com/vi/video123/maxresdefault.jpg');
      expect(result).toContain('、これがおすすめ');
    });

    it('should handle URL followed by full-width exclamation mark (！)', () => {
      const text = 'Check this out! https://youtu.be/cool！すごい';
      const result = convertYoutubeUrls(text);
      // URL should end before ！ (full-width)
      expect(result).toContain('https://img.youtube.com/vi/cool/maxresdefault.jpg');
      expect(result).toContain('！すごい');
    });

    it('should handle embed URL', () => {
      const text = 'Embedded: https://www.youtube.com/embed/embedVideo';
      const result = convertYoutubeUrls(text);
      expect(result).toContain('https://img.youtube.com/vi/embedVideo/maxresdefault.jpg');
    });
  });

  describe('linkifyUrls', () => {
    it('should convert plain URL to clickable link', () => {
      const text = 'Visit https://example.com for more info';
      const result = linkifyUrls(text);
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('>https://example.com</a>');
    });

    it('should convert YouTube URL to regular link (no auto-thumbnail)', () => {
      const text = 'Watch https://www.youtube.com/watch?v=test123';
      const result = linkifyUrls(text);
      // YouTube URLs should be linkified as regular links, not converted to thumbnails
      expect(result).toContain('<a href="https://www.youtube.com/watch?v=test123"');
      expect(result).not.toContain('<img src=');
    });

    it('should handle mixed YouTube and regular URLs (all as links)', () => {
      const text = `
        Check this video: https://youtu.be/ytVideo
        And visit https://example.com for more
      `;
      const result = linkifyUrls(text);
      // Both URLs should be converted to regular links
      expect(result).toContain('<a href="https://youtu.be/ytVideo"');
      expect(result).toContain('<a href="https://example.com"');
    });

    it('should not double-linkify existing links', () => {
      const html = '<a href="https://example.com">Example</a>';
      const result = linkifyUrls(html);
      // Should not wrap the existing link in another link
      expect(result.match(/<a /g)?.length).toBe(1);
    });

    it('should preserve YouTube anchor tags (no auto-thumbnail conversion)', () => {
      const html = '<a href="https://www.youtube.com/watch?v=anchorTest">Video</a>';
      const result = linkifyUrls(html);
      // YouTube anchors should be preserved as-is, not converted to thumbnails
      expect(result).toBe(html);
    });

    it('should handle URL followed by Japanese period (。)', () => {
      const text = 'サイトはこちら https://example.com。ご確認ください';
      const result = linkifyUrls(text);
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('>https://example.com</a>');
      expect(result).toContain('。ご確認ください');
    });

    it('should handle URL followed by Japanese comma (、)', () => {
      const text = 'https://example.com、これが参考になります';
      const result = linkifyUrls(text);
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('、これが参考になります');
    });

    it('should handle URL followed by question mark (？)', () => {
      const text = 'このサイトを見ましたか？ https://example.com？';
      const result = linkifyUrls(text);
      expect(result).toContain('<a href="https://example.com"');
    });

    it('should preserve existing anchor tags for non-YouTube URLs', () => {
      const html = '<a href="https://github.com/test">GitHub</a>';
      const result = linkifyUrls(html);
      expect(result).toBe(html);
    });

    it('should not linkify YouTube thumbnail URLs (img.youtube.com)', () => {
      const html = '<img src="https://img.youtube.com/vi/test/maxresdefault.jpg">';
      const result = linkifyUrls(html);
      // Should not create a link for the thumbnail URL
      expect(result).not.toContain('<a href="https://img.youtube.com');
    });

    it('should preserve pre-inserted YouTube thumbnail with link', () => {
      // This is what the editor inserts when user chooses "thumbnail" mode
      const html = '<a href="https://www.youtube.com/watch?v=abc123" target="_blank"><img src="https://img.youtube.com/vi/abc123/maxresdefault.jpg" alt="YouTube Video" /></a>';
      const result = linkifyUrls(html);
      // Should preserve the structure as-is
      expect(result).toContain('href="https://www.youtube.com/watch?v=abc123"');
      expect(result).toContain('src="https://img.youtube.com/vi/abc123/maxresdefault.jpg"');
    });

    it('should handle empty string', () => {
      const result = linkifyUrls('');
      expect(result).toBe('');
    });

    it('should handle text without URLs', () => {
      const text = 'This is plain text without any URLs.';
      const result = linkifyUrls(text);
      expect(result).toBe(text);
    });

    it('should handle http URLs (not just https)', () => {
      const text = 'Visit http://example.com';
      const result = linkifyUrls(text);
      expect(result).toContain('<a href="http://example.com"');
    });

    it('should handle complex HTML with multiple elements', () => {
      const html = `
        <p>Check out https://example.com</p>
        <p>Also watch <a href="https://youtu.be/video1">this video</a></p>
        <p>And https://another.com/path?query=1</p>
      `;
      const result = linkifyUrls(html);
      expect(result).toContain('<a href="https://example.com"');
      // YouTube anchor should be preserved, not converted to thumbnail
      expect(result).toContain('href="https://youtu.be/video1"');
      expect(result).toContain('<a href="https://another.com/path?query=1"');
    });

    it('should add responsive styles to img tags without style attribute', () => {
      const html = '<p>Here is an image:</p><img src="https://example.com/image.jpg">';
      const result = linkifyUrls(html);
      expect(result).toContain('style="display: block; max-width: 100%; height: auto;"');
    });

    it('should append responsive styles to img tags with existing style', () => {
      const html = '<img src="https://example.com/image.jpg" style="border-radius: 8px;">';
      const result = linkifyUrls(html);
      expect(result).toContain('border-radius: 8px;');
      expect(result).toContain('max-width: 100%;');
      expect(result).toContain('height: auto;');
    });

    it('should not modify img tags that already have max-width', () => {
      const html = '<img src="https://example.com/image.jpg" style="max-width: 480px;">';
      const result = linkifyUrls(html);
      expect(result).toBe(html);
    });
  });

  describe('ensureImageMaxWidth', () => {
    it('should add responsive styles to img tag without style', () => {
      const html = '<img src="https://example.com/image.jpg">';
      const result = ensureImageMaxWidth(html);
      expect(result).toBe('<img src="https://example.com/image.jpg" style="display: block; max-width: 100%; height: auto;">');
    });

    it('should append responsive styles to existing style', () => {
      const html = '<img src="https://example.com/image.jpg" style="border-radius: 8px;">';
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('border-radius: 8px;');
      expect(result).toContain('max-width: 100%;');
      expect(result).toContain('height: auto;');
    });

    it('should handle style without trailing semicolon', () => {
      const html = '<img src="https://example.com/image.jpg" style="border-radius: 8px">';
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('border-radius: 8px;');
      expect(result).toContain('max-width: 100%;');
    });

    it('should not modify img with existing max-width', () => {
      const html = '<img src="https://example.com/image.jpg" style="max-width: 480px; border-radius: 4px;">';
      const result = ensureImageMaxWidth(html);
      expect(result).toBe(html);
    });

    it('should handle max-width with 100% value', () => {
      const html = '<img src="https://example.com/image.jpg" style="max-width: 100%;">';
      const result = ensureImageMaxWidth(html);
      expect(result).toBe(html);
    });

    it('should handle multiple img tags', () => {
      const html = '<img src="a.jpg"><p>text</p><img src="b.jpg" style="border: 1px solid;">';
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('<img src="a.jpg" style="display: block; max-width: 100%; height: auto;">');
      expect(result).toContain('border: 1px solid;');
      expect(result).toContain('max-width: 100%;');
    });

    it('should handle img with multiple attributes', () => {
      const html = '<img src="test.jpg" alt="Test image" width="600" class="responsive">';
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('src="test.jpg"');
      expect(result).toContain('alt="Test image"');
      expect(result).toContain('style="display: block; max-width: 100%; height: auto;"');
    });

    it('should handle self-closing img tags', () => {
      const html = '<img src="test.jpg" />';
      // Note: Our regex expects non-self-closing tags, but should still work
      const result = ensureImageMaxWidth(html);
      // The function handles standard img tags; self-closing variations may differ
      expect(result).toContain('max-width: 100%');
    });

    it('should handle single-quoted style attributes', () => {
      const html = "<img src='test.jpg' style='border: none;'>";
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('max-width: 100%');
    });

    it('should return empty string unchanged', () => {
      expect(ensureImageMaxWidth('')).toBe('');
    });

    it('should return text without img tags unchanged', () => {
      const text = '<p>No images here</p>';
      expect(ensureImageMaxWidth(text)).toBe(text);
    });

    it('should be case-insensitive for IMG and STYLE', () => {
      const html = '<IMG SRC="test.jpg" STYLE="border: 1px;">';
      const result = ensureImageMaxWidth(html);
      expect(result).toContain('max-width: 100%');
    });
  });
});
