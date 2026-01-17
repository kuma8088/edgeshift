import type { BrandSettings, TemplateId, TemplateInfo } from '../../types';
import { replaceVariables } from './variables';
import { renderPreset, isValidTemplateId, TEMPLATE_LIST } from './presets';
import { linkifyUrls } from '../content-processor';

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
  const finalContent = linkifyUrls(processedContent);

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
