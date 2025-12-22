import type { Env, Subscriber } from '../types';

export async function handleUnsubscribe(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  try {
    if (!token) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid unsubscribe link');
    }

    // Find subscriber by unsubscribe token
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE unsubscribe_token = ?'
    ).bind(token).first<Subscriber>();

    if (!subscriber) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid unsubscribe link');
    }

    if (subscriber.status === 'unsubscribed') {
      return redirectWithMessage(env.SITE_URL, 'info', 'Already unsubscribed');
    }

    // Update subscriber status to unsubscribed
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE subscribers
      SET status = 'unsubscribed',
          unsubscribed_at = ?
      WHERE id = ?
    `).bind(now, subscriber.id).run();

    // Redirect to unsubscribe confirmation page
    return Response.redirect(`${env.SITE_URL}/newsletter/unsubscribed`, 302);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return redirectWithMessage(env.SITE_URL, 'error', 'An error occurred');
  }
}

function redirectWithMessage(
  siteUrl: string,
  type: 'success' | 'error' | 'info',
  message: string
): Response {
  const url = new URL('/newsletter/unsubscribed', siteUrl);
  url.searchParams.set('status', type);
  url.searchParams.set('message', message);
  return Response.redirect(url.toString(), 302);
}
