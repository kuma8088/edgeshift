import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';
import { STYLES } from '../styles';

export function renderWelcome(options: PresetRenderOptions): string {
  const { content, brandSettings, subscriberName, unsubscribeUrl, siteUrl } = options;
  const name = subscriberName || 'ゲスト';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${STYLES.body(brandSettings.secondary_color)}">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="${STYLES.headingLarge(brandSettings.primary_color)} margin-bottom: 8px;">🎉 ようこそ！</h1>
    <p style="${STYLES.subheading(brandSettings.secondary_color)}">${name}さん、ご登録ありがとうございます</p>
  </div>
  <div style="${STYLES.content} background-color: #f9fafb; padding: 24px; border-radius: 8px;">
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
