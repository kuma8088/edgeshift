import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES, COLORS, wrapInEmailLayout, applyListStyles } from '../styles';

export function renderProductUpdate(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  const logoHtml = brandSettings.logo_url
    ? `<img src="${brandSettings.logo_url}" alt="${brandSettings.footer_text}" style="max-height: 32px;">`
    : `<span style="font-weight: bold; color: ${brandSettings.primary_color};">${brandSettings.footer_text}</span>`;

  const signatureHtml = brandSettings.email_signature
    ? `<div style="${STYLES.signature}">${brandSettings.email_signature.replace(/\n/g, '<br>')}</div>`
    : '';

  const innerContent = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid ${brandSettings.primary_color};">
      ${logoHtml}
      <span style="${STYLES.badge(brandSettings.primary_color)}">UPDATE</span>
    </div>
    <h1 style="${STYLES.heading(brandSettings.secondary_color)}">🚀 ${subject}</h1>
    <div style="${STYLES.content}">
      ${applyListStyles(content)}
    </div>
    ${signatureHtml}
    <div style="${STYLES.footerWrapper}">
      <p style="${STYLES.footer}">
        <a href="${siteUrl}" style="${STYLES.link(brandSettings.primary_color)}">${brandSettings.footer_text}</a><br>
        <a href="${unsubscribeUrl}" style="${STYLES.link(COLORS.text.muted)}">配信停止はこちら</a>
      </p>
    </div>
  `;

  return wrapInEmailLayout(innerContent, brandSettings.secondary_color);
}
