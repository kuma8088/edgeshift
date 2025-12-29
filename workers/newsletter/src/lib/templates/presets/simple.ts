import type { BrandSettings } from '../../../types';

export interface PresetRenderOptions {
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriberName: string | null;
  unsubscribeUrl: string;
  siteUrl: string;
}

export function renderSimple(options: PresetRenderOptions): string {
  const { content, brandSettings, subscriberName, unsubscribeUrl, siteUrl } = options;
  const greeting = subscriberName ? `${subscriberName}さん、` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 16px;">
    ${greeting}
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
