import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES } from '../styles';

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
<body style="${STYLES.body(brandSettings.secondary_color)}">
  <div style="text-align: center; margin-bottom: 32px;">
    ${logoHtml}
    <h1 style="${STYLES.heading(brandSettings.secondary_color)}">${subject}</h1>
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
