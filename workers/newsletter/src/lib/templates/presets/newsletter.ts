import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES, COLORS, wrapInEmailLayout } from '../styles';

export function renderNewsletter(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  const logoHtml = brandSettings.logo_url
    ? `<img src="${brandSettings.logo_url}" alt="${brandSettings.footer_text}" style="max-height: 40px; margin-bottom: 16px;">`
    : '';

  const innerContent = `
    <div style="text-align: center; margin-bottom: 24px;">
      ${logoHtml}
      <h1 style="${STYLES.heading(brandSettings.secondary_color)}">${subject}</h1>
    </div>
    <div style="${STYLES.content}">
      ${content}
    </div>
    <div style="${STYLES.footerWrapper}">
      <p style="${STYLES.footer}">
        <a href="${siteUrl}" style="${STYLES.link(brandSettings.primary_color)}">${brandSettings.footer_text}</a><br>
        <a href="${unsubscribeUrl}" style="${STYLES.link(COLORS.text.muted)}">配信停止はこちら</a>
      </p>
    </div>
  `;

  return wrapInEmailLayout(innerContent, brandSettings.secondary_color);
}
