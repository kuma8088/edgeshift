import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES, COLORS, wrapInEmailLayout, applyListStyles } from '../styles';

export function renderAnnouncement(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  const innerContent = `
    <div style="background-color: ${brandSettings.primary_color}; color: white; padding: 24px; text-align: center; border-radius: 8px; margin-bottom: 24px;">
      <h1 style="${STYLES.headingLarge('white')}">📢 ${subject}</h1>
    </div>
    <div style="${STYLES.content}">
      ${applyListStyles(content)}
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
