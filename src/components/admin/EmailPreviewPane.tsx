'use client';

/**
 * EmailPreviewPane - Live email preview component that matches actual email format
 *
 * Styles reference: workers/newsletter/src/lib/templates/styles.ts
 * - Gray background (#f5f5f5)
 * - White content box (max-width: 540px, padding: 24px, border-radius: 8px)
 * - Japanese-optimized typography
 *
 * Security note: Content is admin-generated via RichTextEditor, not user input.
 * The HTML is created by TipTap editor which produces sanitized output.
 */

interface EmailPreviewPaneProps {
  content: string;
  subject?: string;
}

/**
 * Extract YouTube video ID from various URL formats
 * Reused from workers/newsletter/src/scheduled.ts
 */
function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Convert YouTube URL to clickable thumbnail HTML
 * Styles match workers/newsletter/src/lib/templates/styles.ts
 */
function youtubeUrlToThumbnail(url: string): string {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) return url;

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Styles from STYLES.youtubeLink and STYLES.youtubeThumbnail
  return `<a href="${videoUrl}" style="display: block; margin: 24px 0; text-decoration: none;" target="_blank" rel="noopener noreferrer">
    <img src="${thumbnailUrl}" alt="YouTube Video" style="width: 100%; max-width: 480px; border-radius: 8px; display: block;" />
  </a>`;
}

/**
 * Convert YouTube URLs in HTML content to clickable thumbnails
 * Processes both:
 * 1. Standalone URLs (plain text YouTube links)
 * 2. [YouTube Video] link text created by RichTextEditor
 */
function convertYoutubeUrlsToThumbnails(html: string): string {
  // Pattern 1: Handle [YouTube Video] anchor tags
  // e.g., <a href="https://youtube.com/watch?v=xxx">[YouTube Video]</a>
  const youtubeAnchorRegex = /<a\s+href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^"]+)"[^>]*>\[YouTube Video\]<\/a>/gi;
  html = html.replace(youtubeAnchorRegex, (_, url) => youtubeUrlToThumbnail(url));

  // Pattern 2: Handle standalone YouTube URLs not inside anchor tags
  // Negative lookbehind to avoid URLs already in href or src attributes
  const standaloneYoutubeRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^\s<>"]+)(?![^<]*<\/a>)/g;
  html = html.replace(standaloneYoutubeRegex, (url) => youtubeUrlToThumbnail(url));

  return html;
}

// Font stack optimized for Japanese + cross-platform (from styles.ts)
const FONT_FAMILY = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Hiragino Kaku Gothic ProN'",
  "'Hiragino Sans'",
  'Meiryo',
  "'Segoe UI'",
  'sans-serif',
].join(', ');

export function EmailPreviewPane({ content, subject }: EmailPreviewPaneProps) {
  // If no content, show placeholder
  if (!content.trim()) {
    return (
      <div
        className="rounded-lg p-8 min-h-[300px] flex items-center justify-center"
        style={{ backgroundColor: '#f5f5f5' }}
      >
        <p className="text-gray-400 text-sm">
          本文を入力するとプレビューが表示されます
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: '#f5f5f5',
        padding: '24px 16px',
      }}
    >
      {/* Subject line preview */}
      {subject && (
        <div
          className="mb-3 px-2"
          style={{
            maxWidth: '540px',
            margin: '0 auto 16px',
          }}
        >
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span>件名</span>
          </div>
          <p
            className="font-medium"
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#1e1e1e',
            }}
          >
            {subject}
          </p>
        </div>
      )}

      {/* Email content box - matches actual email layout */}
      <div
        style={{
          backgroundColor: '#ffffff',
          maxWidth: '540px',
          margin: '0 auto',
          padding: '24px',
          borderRadius: '8px',
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          lineHeight: '1.5',
          letterSpacing: '0.02em',
          color: '#1e1e1e',
        }}
      >
        {/* Render HTML content with proper styling */}
        {/* Content is admin-generated via TipTap editor - safe to render */}
        {/* YouTube URLs are converted to clickable thumbnails for preview */}
        <div
          className="email-content-preview"
          dangerouslySetInnerHTML={{ __html: convertYoutubeUrlsToThumbnails(content) }}
          style={{
            // Reset and apply email styles
            wordBreak: 'break-word',
          }}
        />
      </div>

      {/* Preview footer indicator */}
      <div
        className="mt-4 text-center text-xs text-gray-400"
        style={{ maxWidth: '540px', margin: '16px auto 0' }}
      >
        実際のメールプレビュー
      </div>

      {/* Scoped styles for email content */}
      <style>{`
        .email-content-preview p {
          margin: 0 0 12px 0;
        }
        .email-content-preview p:last-child {
          margin-bottom: 0;
        }
        .email-content-preview h1,
        .email-content-preview h2,
        .email-content-preview h3 {
          margin: 0 0 12px 0;
          line-height: 1.4;
          letter-spacing: 0.01em;
        }
        .email-content-preview h1 {
          font-size: 24px;
        }
        .email-content-preview h2 {
          font-size: 20px;
        }
        .email-content-preview h3 {
          font-size: 18px;
        }
        .email-content-preview ul,
        .email-content-preview ol {
          margin: 0 0 12px 0;
          padding-left: 16px;
        }
        .email-content-preview li {
          margin-bottom: 4px;
        }
        .email-content-preview a {
          color: #7c3aed;
          text-decoration: none;
        }
        .email-content-preview a:hover {
          text-decoration: underline;
        }
        .email-content-preview blockquote {
          margin: 0 0 12px 0;
          padding-left: 16px;
          border-left: 3px solid #e5e5e5;
          color: #525252;
        }
        .email-content-preview hr {
          border: none;
          border-top: 1px solid #e5e5e5;
          margin: 24px 0;
        }
        .email-content-preview strong {
          font-weight: 600;
        }
        .email-content-preview em {
          font-style: italic;
        }
        .email-content-preview code {
          background-color: #f5f5f5;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 14px;
        }
        .email-content-preview pre {
          background-color: #f5f5f5;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 0 0 12px 0;
        }
        .email-content-preview pre code {
          background-color: transparent;
          padding: 0;
        }
        .email-content-preview img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
