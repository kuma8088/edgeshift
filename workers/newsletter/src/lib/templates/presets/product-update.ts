import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES } from '../styles';

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
<body style="${STYLES.body(brandSettings.secondary_color)}">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid ${brandSettings.primary_color};">
    ${logoHtml}
    <span style="${STYLES.badge(brandSettings.primary_color)}">UPDATE</span>
  </div>
  <h1 style="${STYLES.heading(brandSettings.secondary_color)} margin-bottom: 24px;">🚀 ${subject}</h1>
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
