import type { Env, ShortUrl, CreateShortUrlParams } from '../types';

// Constants
export const SHORT_URL_BASE = 'https://edgeshift.tech/r';
export const CODE_LENGTH = 8;
export const MAX_RETRIES = 3;

// Alphanumeric characters for short code generation
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random 8-character alphanumeric short code
 * Uses crypto.getRandomValues for cryptographically secure randomness
 */
export function generateShortCode(): string {
  const randomBytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(randomBytes);

  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[randomBytes[i] % CHARSET.length];
  }

  return code;
}

/**
 * Extract URLs from <a href="..."> tags in HTML
 * Returns array of URLs with their positions (1-indexed order of appearance)
 */
export function extractUrls(html: string): Array<{ url: string; position: number }> {
  // Match <a href="..."> or <a href='...'>
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const urls: Array<{ url: string; position: number }> = [];

  let match: RegExpExecArray | null;
  let position = 0;

  while ((match = regex.exec(html)) !== null) {
    position++; // Increment first to get 1-indexed
    urls.push({
      url: match[1],
      position,
    });
  }

  return urls;
}

/**
 * Check if URL should be excluded from shortening
 * Excludes: mailto:, tel:, and unsubscribe URLs
 */
export function isExcludedUrl(url: string): boolean {
  // mailto: links
  if (url.startsWith('mailto:')) {
    return true;
  }

  // tel: links
  if (url.startsWith('tel:')) {
    return true;
  }

  // Unsubscribe URLs
  if (url.includes('/api/newsletter/unsubscribe')) {
    return true;
  }

  return false;
}

export interface ReplaceUrlsOptions {
  campaignId?: string;
  sequenceStepId?: string;
}

export interface ReplaceUrlsResult {
  html: string;
  shortUrls: ShortUrl[];
}

/**
 * Replace all trackable URLs in HTML with shortened versions
 * Creates DB records for each shortened URL
 *
 * @param env - Worker environment with DB binding
 * @param html - HTML content with URLs to shorten
 * @param options - Campaign or sequence step ID to associate with URLs
 * @returns Modified HTML and array of created ShortUrl records
 */
export async function replaceUrlsWithShortened(
  env: Env,
  html: string,
  options: ReplaceUrlsOptions
): Promise<ReplaceUrlsResult> {
  const extractedUrls = extractUrls(html);
  const shortUrls: ShortUrl[] = [];

  // Filter out excluded URLs
  const urlsToShorten = extractedUrls.filter(({ url }) => !isExcludedUrl(url));

  if (urlsToShorten.length === 0) {
    return { html, shortUrls: [] };
  }

  let modifiedHtml = html;

  // Track occurrence count per URL for correct replacement
  // (position is global across all links, but replaceUrlAtPosition needs per-URL occurrence)
  const urlOccurrenceCount: Map<string, number> = new Map();

  // Process each URL
  for (const { url, position } of urlsToShorten) {
    // Calculate the per-URL occurrence number (1-indexed)
    const occurrence = (urlOccurrenceCount.get(url) || 0) + 1;
    urlOccurrenceCount.set(url, occurrence);

    const shortUrl = await createShortUrl(env, {
      originalUrl: url,
      position,
      campaignId: options.campaignId,
      sequenceStepId: options.sequenceStepId,
    });

    shortUrls.push(shortUrl);

    // Replace this specific occurrence of the URL
    // Use per-URL occurrence number, not global position
    const shortLink = `${SHORT_URL_BASE}/${shortUrl.short_code}`;
    modifiedHtml = replaceUrlAtPosition(modifiedHtml, url, shortLink, occurrence);
  }

  return { html: modifiedHtml, shortUrls };
}

/**
 * Replace a URL at a specific position (nth occurrence, 1-indexed)
 * This ensures same URLs at different positions get different short codes
 */
function replaceUrlAtPosition(
  html: string,
  originalUrl: string,
  shortUrl: string,
  position: number
): string {
  // Count occurrences and replace the nth one (1-indexed)
  const regex = new RegExp(
    `(<a\\s+[^>]*href=["'])${escapeRegExp(originalUrl)}(["'][^>]*>)`,
    'gi'
  );

  let currentPosition = 0;

  return html.replace(regex, (match, prefix, suffix) => {
    currentPosition++; // Increment first to get 1-indexed
    if (currentPosition === position) {
      return `${prefix}${shortUrl}${suffix}`;
    }
    return match;
  });
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a short URL record in the database
 * Handles collision by retrying with new codes
 */
async function createShortUrl(
  env: Env,
  params: CreateShortUrlParams
): Promise<ShortUrl> {
  const now = Math.floor(Date.now() / 1000);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const id = crypto.randomUUID();
    const shortCode = generateShortCode();

    try {
      await env.DB.prepare(`
        INSERT INTO short_urls (id, short_code, original_url, position, campaign_id, sequence_step_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        shortCode,
        params.originalUrl,
        params.position,
        params.campaignId || null,
        params.sequenceStepId || null,
        now
      ).run();

      return {
        id,
        short_code: shortCode,
        original_url: params.originalUrl,
        position: params.position,
        campaign_id: params.campaignId || null,
        sequence_step_id: params.sequenceStepId || null,
        created_at: now,
      };
    } catch (error) {
      // If it's a unique constraint violation (collision), retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('UNIQUE constraint failed') && attempt < MAX_RETRIES - 1) {
        console.warn(`Short code collision, retrying (attempt ${attempt + 1})`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to generate unique short code after ${MAX_RETRIES} attempts`);
}

/**
 * Find a short URL record by its code
 *
 * @param env - Worker environment with DB binding
 * @param code - The short code to look up
 * @returns ShortUrl record or null if not found
 */
export async function findShortUrlByCode(
  env: Env,
  code: string
): Promise<ShortUrl | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM short_urls WHERE short_code = ?'
  ).bind(code).first<ShortUrl>();

  return result || null;
}
