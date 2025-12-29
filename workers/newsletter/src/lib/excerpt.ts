/**
 * Generate excerpt from HTML content
 *
 * Strips HTML tags and truncates to specified length
 */
export function generateExcerpt(html: string, maxLength: number = 150): string {
  // Strip HTML tags
  const text = html
    .replace(/<[^>]*>/g, ' ')  // Replace tags with spaces
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();

  // Truncate to max length
  if (text.length <= maxLength) {
    return text;
  }

  // Find last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > 0
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...';
}
