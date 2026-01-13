import type { BrandSettings } from '../../../types';
import { STYLES, COLORS, wrapInEmailLayout } from '../styles';

export interface PresetRenderOptions {
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriberName: string | null;
  unsubscribeUrl: string;
  siteUrl: string;
}

export function renderSimple(options: PresetRenderOptions): string {
  const { content, brandSettings, unsubscribeUrl, siteUrl } = options;

  const innerContent = `
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
