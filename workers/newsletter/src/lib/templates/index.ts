import type { BrandSettings, Env, TemplateId, TemplateInfo } from '../../types';
import { replaceVariables } from './variables';
import { renderPreset, isValidTemplateId, TEMPLATE_LIST } from './presets';
import { linkifyUrls } from '../content-processor';
import { replaceUrlsWithShortened } from '../url-shortener';

/**
 * Transform empty paragraphs for email client compatibility.
 * <p></p> renders with zero height in many email clients.
 *
 * Note: Uses simple regex replacement. This is safe because TipTap editor
 * output does not contain HTML comments, CDATA sections, or data attributes
 * with HTML-like content.
 */
function processEmptyParagraphs(html: string): string {
  return html.replace(/<p><\/p>/g, '<p><br></p>');
}

export interface RenderEmailOptions {
  templateId: string;
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriber: { name: string | null; email: string };
  unsubscribeUrl: string;
  siteUrl: string;
}

export function renderEmail(options: RenderEmailOptions): string {
  const { templateId, content, subject, brandSettings, subscriber, unsubscribeUrl, siteUrl } = options;

  // Replace variables in content first
  const processedContent = replaceVariables(content, {
    subscriberName: subscriber.name,
    unsubscribeUrl,
  });

  // Process URLs and YouTube links
  const linkedContent = linkifyUrls(processedContent);

  // Transform empty paragraphs for email client compatibility
  const finalContent = processEmptyParagraphs(linkedContent);

  // Validate and get template ID
  const validTemplateId: TemplateId = isValidTemplateId(templateId) ? templateId : 'simple';

  // Render using preset
  return renderPreset(validTemplateId, {
    content: finalContent,
    subject,
    brandSettings,
    subscriberName: subscriber.name,
    unsubscribeUrl,
    siteUrl,
  });
}

export function getDefaultBrandSettings(): BrandSettings {
  return {
    id: 'default',
    logo_url: null,
    primary_color: '#7c3aed',
    secondary_color: '#1e1e1e',
    footer_text: 'EdgeShift Newsletter',
    email_signature: '',
    default_template_id: 'simple',
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };
}

export function getTemplateList(): TemplateInfo[] {
  return TEMPLATE_LIST;
}

export { isValidTemplateId };

/**
 * Options for URL shortening in async email rendering
 */
export interface ShortenUrlsOptions {
  env: Env;
  campaignId?: string;
  sequenceStepId?: string;
}

/**
 * Extended options for async email rendering with optional URL shortening
 */
export interface RenderEmailAsyncOptions extends RenderEmailOptions {
  shortenUrls?: ShortenUrlsOptions;
}

/**
 * Async version of renderEmail that supports URL shortening.
 *
 * When shortenUrls option is provided, all trackable URLs in the email
 * will be replaced with short URLs for click tracking.
 *
 * @param options - Render options including optional URL shortening config
 * @returns Rendered HTML with optionally shortened URLs
 */
export async function renderEmailAsync(
  options: RenderEmailAsyncOptions
): Promise<string> {
  // 1. Call existing renderEmail() to get HTML
  const html = renderEmail(options);

  // 2. If shortenUrls option provided, replace URLs
  if (options.shortenUrls) {
    const { env, campaignId, sequenceStepId } = options.shortenUrls;
    const result = await replaceUrlsWithShortened(env, html, {
      campaignId,
      sequenceStepId,
    });
    return result.html;
  }

  return html;
}
