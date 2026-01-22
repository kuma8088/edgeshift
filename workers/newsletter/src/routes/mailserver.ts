/**
 * Mailserver API Proxy
 *
 * Proxies requests to admin.kuma8088.com mailserver API.
 * This avoids CORS issues by making server-to-server requests.
 */

import type { Env, MailUser } from '../types';
import { isAuthorizedAsync } from '../lib/auth';

const MAILSERVER_API_BASE = 'https://admin.kuma8088.com';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function handleListMailUsers(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: JSON_HEADERS }
    );
  }

  // Check CF Access credentials and warn if missing
  const hasCFAccessCredentials = !!env.CF_ACCESS_CLIENT_ID && !!env.CF_ACCESS_CLIENT_SECRET;
  if (!hasCFAccessCredentials) {
    console.warn('Mailserver proxy: CF Access credentials not configured', {
      hasCF_ACCESS_CLIENT_ID: !!env.CF_ACCESS_CLIENT_ID,
      hasCF_ACCESS_CLIENT_SECRET: !!env.CF_ACCESS_CLIENT_SECRET,
    });
  }

  // Build request URL
  const url = new URL(request.url);
  const enabledOnly = url.searchParams.get('enabled_only') === 'true';
  const mailserverUrl = `${MAILSERVER_API_BASE}/api/mailserver/users${enabledOnly ? '?enabled_only=true' : ''}`;

  try {
    // Build headers
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (hasCFAccessCredentials) {
      headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID!;
      headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET!;
    }

    const response = await fetch(mailserverUrl, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mailserver API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        requestUrl: mailserverUrl,
        hasCFAccessCredentials,
      });

      // Return user-friendly error message
      let userMessage: string;
      if (response.status === 401 || response.status === 403) {
        userMessage = 'メールサーバーへの認証に失敗しました';
      } else if (response.status >= 500) {
        userMessage = 'メールサーバーで内部エラーが発生しました';
      } else {
        userMessage = `メールサーバーAPIエラー: ${response.status}`;
      }

      return new Response(
        JSON.stringify({ success: false, error: userMessage }),
        { status: response.status, headers: JSON_HEADERS }
      );
    }

    // Parse and validate response
    const data = await response.json() as unknown;

    if (!data || typeof data !== 'object') {
      console.error('Mailserver API returned unexpected response format:', {
        responseType: typeof data,
        requestUrl: mailserverUrl,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'メールサーバーからの応答形式が不正です' }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    const mailResponse = data as { users?: unknown; total?: unknown };

    if (!Array.isArray(mailResponse.users)) {
      console.error('Mailserver API response missing users array:', {
        hasUsers: 'users' in mailResponse,
        usersType: typeof mailResponse.users,
        requestUrl: mailserverUrl,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'メールサーバーからのユーザーデータが不正です' }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          users: mailResponse.users as MailUser[],
          total: typeof mailResponse.total === 'number' ? mailResponse.total : mailResponse.users.length,
        },
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error) {
    // Classify error type
    const isNetworkError = error instanceof TypeError &&
      (error.message.includes('fetch') || error.message.includes('network'));
    const isJsonError = error instanceof SyntaxError;

    console.error('Mailserver proxy error:', {
      errorType: error?.constructor?.name || 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      isNetworkError,
      isJsonError,
      requestUrl: mailserverUrl,
    });

    let userMessage: string;
    let statusCode: number;

    if (isNetworkError) {
      userMessage = 'メールサーバーに接続できません';
      statusCode = 503;
    } else if (isJsonError) {
      userMessage = 'メールサーバーからの応答を解析できませんでした';
      statusCode = 502;
    } else {
      userMessage = 'メールユーザーの取得中にエラーが発生しました';
      statusCode = 500;
    }

    return new Response(
      JSON.stringify({ success: false, error: userMessage }),
      { status: statusCode, headers: JSON_HEADERS }
    );
  }
}
