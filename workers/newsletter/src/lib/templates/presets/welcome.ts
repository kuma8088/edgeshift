import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES, COLORS, wrapInEmailLayout, applyListStyles } from '../styles';

export function renderWelcome(options: PresetRenderOptions): string {
  const { content, brandSettings, subscriberName, unsubscribeUrl, siteUrl } = options;

  // Welcome template explicitly uses subscriber name
  const name = subscriberName || 'ゲスト';

  const signatureHtml = brandSettings.email_signature
    ? `<div style="${STYLES.signature}">${brandSettings.email_signature.replace(/\n/g, '<br>')}</div>`
    : '';

  const innerContent = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="${STYLES.headingLarge(brandSettings.primary_color)} margin-bottom: 8px;">🎉 ようこそ！</h1>
      <p style="${STYLES.subheading(brandSettings.secondary_color)}">${name}さん、ご登録ありがとうございます</p>
    </div>
    <div style="${STYLES.content} background-color: #f9fafb; padding: 24px; border-radius: 8px;">
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
