import type { Env, BrandSettings, PreviewRequest, TestSendRequest } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmail, getDefaultBrandSettings, getTemplateList } from '../lib/templates';
import { sendEmail } from '../lib/email';

export async function getTemplates(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  return successResponse(getTemplateList());
}

export async function previewTemplate(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: PreviewRequest = await request.json();

    if (!body.template_id || !body.content) {
      return errorResponse('template_id and content are required', 400);
    }

    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    if (body.brand_settings) {
      brandSettings = { ...brandSettings, ...body.brand_settings };
    }

    const html = renderEmail({
      templateId: body.template_id,
      content: body.content,
      subject: body.subject || 'Preview',
      brandSettings,
      subscriber: { name: 'プレビューユーザー', email: 'preview@example.com' },
      unsubscribeUrl: `${env.SITE_URL}/unsubscribe/preview`,
      siteUrl: env.SITE_URL,
    });

    return successResponse({ html });
  } catch (error) {
    console.error('Preview template error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function testSendTemplate(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: TestSendRequest = await request.json();

    if (!body.template_id || !body.content || !body.to) {
      return errorResponse('template_id, content, and to are required', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return errorResponse('Invalid email address', 400);
    }

    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const html = renderEmail({
      templateId: body.template_id,
      content: body.content,
      subject: body.subject || 'テストメール',
      brandSettings,
      subscriber: { name: 'テスト送信者', email: body.to },
      unsubscribeUrl: `${env.SITE_URL}/unsubscribe/test`,
      siteUrl: env.SITE_URL,
    });

    const result = await sendEmail(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      {
        to: body.to,
        subject: `[テスト] ${body.subject || 'テストメール'}`,
        html,
      }
    );

    if (!result.success) {
      return errorResponse(result.error || 'Failed to send test email', 500);
    }

    return successResponse({ message_id: result.id });
  } catch (error) {
    console.error('Test send error:', error);
    return errorResponse('Internal server error', 500);
  }
}
