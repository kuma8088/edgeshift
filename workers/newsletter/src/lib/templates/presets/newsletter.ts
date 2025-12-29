import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

export function renderNewsletter(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  const logoHtml = brandSettings.logo_url
    ? `<img src="${brandSettings.logo_url}" alt="${brandSettings.footer_text}" style="max-height: 40px; margin-bottom: 16px;">`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    ${logoHtml}
    <h1 style="color: ${brandSettings.secondary_color}; font-size: 24px; margin: 0;">${subject}</h1>
  </div>
  <div style="margin-bottom: 32px;">
    ${content}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="${siteUrl}" style="color: ${brandSettings.primary_color};">${brandSettings.footer_text}</a><br>
    <a href="${unsubscribeUrl}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>
  `.trim();
}
