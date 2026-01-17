import type { Env, BrandSettings, PreviewRequest, TestSendRequest } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmail, getDefaultBrandSettings, getTemplateList } from '../lib/templates';
import { sendEmail } from '../lib/email';
import {
  ensureResendContact,
  createTempSegment,
  addContactsToSegment,
  deleteSegment,
  createAndSendBroadcast,
} from '../lib/resend-marketing';

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

    const subject = `[テスト] ${body.subject || 'テストメール'}`;
    const html = renderEmail({
      templateId: body.template_id,
      content: body.content,
      subject,
      brandSettings,
      subscriber: { name: 'テスト送信者', email: body.to },
      unsubscribeUrl: `${env.SITE_URL}/unsubscribe/test`,
      siteUrl: env.SITE_URL,
    });

    const from = `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`;

    // Use Broadcast API if available (same as production)
    const useBroadcastApi = env.USE_BROADCAST_API === 'true' && !!env.RESEND_AUDIENCE_ID;

    if (useBroadcastApi) {
      const config = { apiKey: env.RESEND_API_KEY };

      // 1. Ensure test recipient exists as Resend contact
      const contactResult = await ensureResendContact(config, body.to, 'テスト送信者');

      if (!contactResult.success || !contactResult.contactId) {
        return errorResponse(contactResult.error || 'Failed to create contact', 500);
      }

      // 2. Create temp segment for test
      const segmentResult = await createTempSegment(config, `test-${Date.now()}`);
      if (!segmentResult.success || !segmentResult.segmentId) {
        return errorResponse(segmentResult.error || 'Failed to create segment', 500);
      }

      try {
        // 3. Add contact to segment
        const addResult = await addContactsToSegment(config, segmentResult.segmentId, [contactResult.contactId]);
        if (!addResult.success) {
          await deleteSegment(config, segmentResult.segmentId);
          return errorResponse(addResult.errors.join(', ') || 'Failed to add contact to segment', 500);
        }

        // 4. Send broadcast
        const broadcastResult = await createAndSendBroadcast(config, {
          segmentId: segmentResult.segmentId,
          from,
          subject,
          html,
          name: `Test: ${subject}`,
        });

        if (!broadcastResult.success) {
          await deleteSegment(config, segmentResult.segmentId);
          return errorResponse(broadcastResult.error || 'Failed to send broadcast', 500);
        }

        // 5. Cleanup segment
        await deleteSegment(config, segmentResult.segmentId);

        return successResponse({ broadcast_id: broadcastResult.broadcastId });
      } catch (error) {
        // Ensure cleanup on error
        await deleteSegment(config, segmentResult.segmentId);
        throw error;
      }
    }

    // Fallback to Transactional API
    const result = await sendEmail(env.RESEND_API_KEY, from, {
      to: body.to,
      subject,
      html,
    });

    if (!result.success) {
      return errorResponse(result.error || 'Failed to send test email', 500);
    }

    return successResponse({ message_id: result.id });
  } catch (error) {
    console.error('Test send error:', error);
    return errorResponse('Internal server error', 500);
  }
}
