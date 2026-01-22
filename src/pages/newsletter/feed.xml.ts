/**
 * RSS 2.0 Feed for Newsletter Archive
 * Generates RSS feed from published newsletter articles.
 * SSR-enabled for dynamic content.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

interface Campaign {
  id: string;
  slug: string;
  subject: string;
  content: string;
  sent_at: string;
  created_at: string;
}

interface ArchiveResponse {
  success: boolean;
  data: {
    articles: Campaign[];
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date to RFC 822 (required by RSS 2.0)
 * Example: "Wed, 02 Oct 2002 13:00:00 GMT"
 * Note: sent_at is Unix timestamp in seconds
 */
function toRFC822(timestamp: string | number): string {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  const date = new Date(ts * 1000); // Convert seconds to milliseconds
  return date.toUTCString();
}

/**
 * Extract plain text from HTML for description
 */
function extractPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const GET: APIRoute = async ({ site, url }) => {
  try {
    // Fetch latest 20 articles (use default limit/offset to avoid query param routing issues)
    const apiUrl = `${site}api/archive`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data: ArchiveResponse = await response.json();

    if (!data.success) {
      throw new Error('API returned error');
    }

    const articles = data.data.articles;

    // Build RSS feed
    const feedUrl = `${site}newsletter/feed.xml`;
    const archiveUrl = `${site}newsletter/archive`;
    const buildDate = toRFC822(new Date().toISOString());

    const rssItems = articles
      .map((article) => {
        const itemUrl = `${site}newsletter/archive/${article.slug}`;
        const description = extractPlainText(article.content);
        const excerpt = description.length > 300
          ? description.substring(0, 300) + '...'
          : description;

        return `
    <item>
      <title>${escapeXml(article.subject)}</title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <pubDate>${toRFC822(article.sent_at)}</pubDate>
      <description>${escapeXml(excerpt)}</description>
      <content:encoded><![CDATA[${article.content}]]></content:encoded>
    </item>`;
      })
      .join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>EdgeShift Newsletter</title>
    <link>${escapeXml(archiveUrl)}</link>
    <description>EdgeShift のニュースレター。最新の技術情報やプロジェクトアップデートをお届けします。</description>
    <language>ja</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <generator>Astro + Cloudflare</generator>
    <webMaster>naoya.iimura@gmail.com (EdgeShift)</webMaster>
    <managingEditor>naoya.iimura@gmail.com (EdgeShift)</managingEditor>
    <copyright>Copyright ${new Date().getFullYear()} EdgeShift. All rights reserved.</copyright>${rssItems}
  </channel>
</rss>`;

    return new Response(rssXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('RSS feed generation error:', error);

    // Return minimal error feed
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>EdgeShift Newsletter</title>
    <link>${site}newsletter/archive</link>
    <description>Error generating RSS feed</description>
  </channel>
</rss>`;

    return new Response(errorXml, {
      status: 500,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }
};
