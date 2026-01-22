/**
 * Mailserver API Proxy
 *
 * Proxies requests to admin.kuma8088.com mailserver API.
 * This avoids CORS issues by making server-to-server requests.
 */

import type { Env, MailUser } from '../types';
import { isAuthorizedAsync } from '../lib/auth';

const MAILSERVER_API_BASE = 'https://admin.kuma8088.com';

interface MailUserListResponse {
  users: MailUser[];
  total: number;
}

export async function handleListMailUsers(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Forward request to mailserver API
    const url = new URL(request.url);
    const enabledOnly = url.searchParams.get('enabled_only') === 'true';

    const mailserverUrl = `${MAILSERVER_API_BASE}/api/mailserver/users${enabledOnly ? '?enabled_only=true' : ''}`;

    const response = await fetch(mailserverUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // CF Access Service Token auth (if configured)
        ...(env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET
          ? {
              'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
              'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
            }
          : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mailserver API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Mailserver API error: ${response.status} ${response.statusText}`,
        }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json() as MailUserListResponse;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          users: data.users || [],
          total: data.total || 0,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Mailserver proxy error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch mail users',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
