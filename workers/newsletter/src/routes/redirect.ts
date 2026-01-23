import type { Env } from '../types';
import { findShortUrlByCode } from '../lib/url-shortener';

/**
 * Handle redirect for short URLs
 *
 * GET /r/:code
 *
 * This is a public endpoint (no authentication required).
 * Looks up the short code and redirects to the original URL.
 *
 * @param request - The incoming request
 * @param env - Worker environment with DB binding
 * @param code - The 8-character short code from the URL path
 * @returns 302 redirect to original URL, or 404 if not found
 */
export async function handleRedirect(
  request: Request,
  env: Env,
  code: string
): Promise<Response> {
  // Validate code exists and is not empty
  if (!code || code.trim() === '') {
    return new Response('Not Found', { status: 404 });
  }

  // Look up the short URL in the database
  const shortUrl = await findShortUrlByCode(env, code);

  if (!shortUrl) {
    return new Response('Not Found', { status: 404 });
  }

  // Return 302 redirect to the original URL
  return new Response(null, {
    status: 302,
    headers: {
      Location: shortUrl.original_url,
    },
  });
}
