import type { BrandSettings } from '../../../types';
import { STYLES } from '../styles';

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
<body style="${STYLES.body(brandSettings.secondary_color)}">
  <div style="margin-bottom: 16px;">
    ${greeting}
  </div>
  <div style="${STYLES.content}">
    ${content}
  </div>
  <hr style="${STYLES.hr}">
  <p style="${STYLES.footer}">
    <a href="${siteUrl}" style="color: ${brandSettings.primary_color};">${brandSettings.footer_text}</a><br>
    <a href="${unsubscribeUrl}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>
  `.trim();
}
