import type { Env, Subscriber } from '../types';
import { findShortUrlByCode } from '../lib/url-shortener';
import { updateContactUnsubscribe, type ResendMarketingConfig } from '../lib/resend-marketing';

/**
 * Detect if a URL is an unsubscribe link
 *
 * Patterns:
 * - unsubscribe.resend.com (Resend's unsubscribe domain)
 * - /api/newsletter/unsubscribe (our unsubscribe endpoint)
 * - {{RESEND_UNSUBSCRIBE_URL}} (placeholder - shouldn't happen with Task 1 fix, but safeguard)
 */
function isUnsubscribeUrl(url: string): boolean {
  return (
    url.includes('unsubscribe.resend.com') ||
    url.includes('/api/newsletter/unsubscribe') ||
    url.includes('{{RESEND_UNSUBSCRIBE_URL}}')
  );
}

/**
 * Auto-unsubscribe user when they click a shortened unsubscribe link
 *
 * This is a safeguard for future bugs where unsubscribe links might get shortened.
 * Extracts email from query params OR unsubscribe token from URL path.
 */
async function autoUnsubscribe(
  request: Request,
  env: Env,
  originalUrl: string
): Promise<Response> {
  const url = new URL(request.url);
  let subscriber: Subscriber | null = null;

  // Try to extract unsubscribe token from our endpoint pattern
  // Pattern: https://edgeshift.tech/api/newsletter/unsubscribe/{token}
  const unsubscribeMatch = originalUrl.match(/\/api\/newsletter\/unsubscribe\/([^\/\?]+)/);
  if (unsubscribeMatch) {
    const token = unsubscribeMatch[1];
    subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE unsubscribe_token = ?'
    ).bind(token).first<Subscriber>();
  }

  // If not found via token, try email query param (Resend's pattern)
  if (!subscriber) {
    const email = url.searchParams.get('email');
    if (email) {
      subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE email = ?'
      ).bind(email).first<Subscriber>();
    }
  }

  if (!subscriber) {
    // Gracefully handle unknown subscriber (CAN-SPAM compliance)
    console.warn('Auto-unsubscribe: subscriber not found (graceful fallback)', {
      original_url: originalUrl,
    });
    return Response.redirect(`${env.SITE_URL}/newsletter/unsubscribed`, 302);
  }

  if (subscriber.status === 'unsubscribed') {
    // Already unsubscribed
    return Response.redirect(`${env.SITE_URL}/newsletter/unsubscribed?status=info&message=Already+unsubscribed`, 302);
  }

  // Update subscriber status to unsubscribed in D1 (source of truth)
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    UPDATE subscribers
    SET status = 'unsubscribed',
        unsubscribed_at = ?
    WHERE id = ?
  `).bind(now, subscriber.id).run();

  // Best-effort sync to Resend (non-blocking)
  try {
    const resendConfig: ResendMarketingConfig = {
      apiKey: env.RESEND_API_KEY,
    };
    const syncResult = await updateContactUnsubscribe(resendConfig, subscriber.email);
    if (!syncResult.success) {
      console.warn('Failed to sync auto-unsubscribe to Resend (non-blocking):', {
        email: subscriber.email,
        error: syncResult.error,
      });
    }
  } catch (resendError) {
    console.warn('Resend sync error during auto-unsubscribe (non-blocking):', {
      email: subscriber.email,
      error: resendError instanceof Error ? resendError.message : String(resendError),
    });
  }

  // Redirect to unsubscribed confirmation page
  return Response.redirect(`${env.SITE_URL}/newsletter/unsubscribed`, 302);
}

/**
 * Handle redirect for short URLs
 *
 * GET /r/:code
 *
 * This is a public endpoint (no authentication required).
 * Looks up the short code and redirects to the original URL.
 *
 * **Safeguard:** If the URL is an unsubscribe link, automatically unsubscribe the user
 * instead of redirecting to Resend (prevents CAN-SPAM violations).
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

  // SAFEGUARD: Detect unsubscribe URLs and auto-unsubscribe
  if (isUnsubscribeUrl(shortUrl.original_url)) {
    console.warn('Detected shortened unsubscribe link (this should not happen with Task 1 fix):', {
      short_code: code,
      original_url: shortUrl.original_url,
    });
    return autoUnsubscribe(request, env, shortUrl.original_url);
  }

  // Return 302 redirect to the original URL
  return new Response(null, {
    status: 302,
    headers: {
      Location: shortUrl.original_url,
    },
  });
}
