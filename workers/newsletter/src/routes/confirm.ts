import type { Env, Subscriber } from '../types';

export async function handleConfirm(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  try {
    if (!token) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid confirmation link');
    }

    // Find subscriber by confirm token
    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE confirm_token = ?'
    ).bind(token).first<Subscriber>();

    if (!subscriber) {
      return redirectWithMessage(env.SITE_URL, 'error', 'Invalid or expired confirmation link');
    }

    if (subscriber.status === 'active') {
      return redirectWithMessage(env.SITE_URL, 'info', 'Already confirmed');
    }

    // Update subscriber status to active
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE subscribers
      SET status = 'active',
          confirm_token = NULL,
          subscribed_at = ?
      WHERE id = ?
    `).bind(now, subscriber.id).run();

    // Redirect to confirmation page
    return Response.redirect(`${env.SITE_URL}/newsletter/confirmed`, 302);
  } catch (error) {
    console.error('Confirm error:', error);
    return redirectWithMessage(env.SITE_URL, 'error', 'An error occurred');
  }
}

function redirectWithMessage(
  siteUrl: string,
  type: 'success' | 'error' | 'info',
  message: string
): Response {
  const url = new URL('/newsletter/confirmed', siteUrl);
  url.searchParams.set('status', type);
  url.searchParams.set('message', message);
  return Response.redirect(url.toString(), 302);
}
