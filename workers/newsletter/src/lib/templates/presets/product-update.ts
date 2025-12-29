import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

export function renderProductUpdate(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  const logoHtml = brandSettings.logo_url
    ? `<img src="${brandSettings.logo_url}" alt="${brandSettings.footer_text}" style="max-height: 32px;">`
    : `<span style="font-weight: bold; color: ${brandSettings.primary_color};">${brandSettings.footer_text}</span>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid ${brandSettings.primary_color};">
    ${logoHtml}
    <span style="background-color: ${brandSettings.primary_color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">UPDATE</span>
  </div>
  <h1 style="font-size: 24px; color: ${brandSettings.secondary_color}; margin-bottom: 24px;">🚀 ${subject}</h1>
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
