import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: ${brandSettings.primary_color}; font-size: 28px; margin-bottom: 8px;">🎉 ようこそ！</h1>
    <p style="font-size: 18px; color: ${brandSettings.secondary_color};">${name}さん、ご登録ありがとうございます</p>
  </div>
  <div style="margin-bottom: 32px; background-color: #f9fafb; padding: 24px; border-radius: 8px;">
    ${content}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="${siteUrl}" style="color: ${brandSettings.primary_color};">${brandSettings.footer_text}</a><br>
    <a href="${unsubscribeUrl}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>
  `.trim();
}
