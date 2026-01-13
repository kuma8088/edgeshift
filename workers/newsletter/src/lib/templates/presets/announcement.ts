import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES } from '../styles';

export function renderAnnouncement(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${STYLES.body(brandSettings.secondary_color)}">
  <div style="background-color: ${brandSettings.primary_color}; color: white; padding: 24px; text-align: center; border-radius: 8px; margin-bottom: 24px;">
    <h1 style="${STYLES.headingLarge('white')}">📢 ${subject}</h1>
  </div>
  <div style="${STYLES.content} padding: 0 16px;">
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
