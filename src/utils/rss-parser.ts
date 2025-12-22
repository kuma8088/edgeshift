import type { ZennArticle, ParsedRSS } from '../types/zenn';

/**
 * Parse Zenn RSS feed XML into structured data
 */
export function parseRSS(xmlText: string): ParsedRSS {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Failed to parse RSS feed');
  }

  const items = Array.from(doc.querySelectorAll('item')).map((item): ZennArticle => {
    const title = item.querySelector('title')?.textContent ?? '';
    const link = item.querySelector('link')?.textContent ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent ?? '';
    const rawDescription = item.querySelector('description')?.textContent ?? '';
    const enclosure = item.querySelector('enclosure')?.getAttribute('url') ?? undefined;
    const creator = item.querySelector('dc\\:creator, creator')?.textContent ?? 'kuma8088';

    // Strip HTML tags from description
    const description = stripHtml(rawDescription);

    return {
      title,
      link,
      pubDate,
      description,
      enclosure,
      creator,
    };
  });

  const lastBuildDate = doc.querySelector('lastBuildDate')?.textContent ?? '';

  return {
    items,
    lastBuildDate,
  };
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Format date string to Japanese locale
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Format date string to relative time (e.g., "35分前", "1日前")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'たった今';
    if (diffMinutes < 60) return `${diffMinutes}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 30) return `${diffDays}日前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  } catch {
    return dateString;
  }
}
