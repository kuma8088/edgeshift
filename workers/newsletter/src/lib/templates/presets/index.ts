import type { TemplateId, TemplateInfo } from '../../../types';
import { renderSimple, type PresetRenderOptions } from './simple';
import { renderNewsletter } from './newsletter';
import { renderAnnouncement } from './announcement';
import { renderWelcome } from './welcome';
import { renderProductUpdate } from './product-update';

export type { PresetRenderOptions };

export const TEMPLATE_LIST: TemplateInfo[] = [
  { id: 'simple', name: 'シンプル', description: 'テキスト中心のシンプルなレイアウト' },
  { id: 'newsletter', name: 'ニュースレター', description: 'ヘッダー付きの定番スタイル' },
  { id: 'announcement', name: 'お知らせ', description: '重要なお知らせを強調表示' },
  { id: 'welcome', name: 'ウェルカム', description: '新規登録者への挨拶メール' },
  { id: 'product-update', name: 'プロダクトアップデート', description: '製品・サービスの更新情報' },
];

const renderers: Record<TemplateId, (options: PresetRenderOptions) => string> = {
  simple: renderSimple,
  newsletter: renderNewsletter,
  announcement: renderAnnouncement,
  welcome: renderWelcome,
  'product-update': renderProductUpdate,
};

export function renderPreset(templateId: TemplateId, options: PresetRenderOptions): string {
  const renderer = renderers[templateId];
  if (!renderer) {
    console.warn(`Unknown template ID: ${templateId}, falling back to simple`);
    return renderSimple(options);
  }
  return renderer(options);
}

export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_LIST.some((t) => t.id === id);
}
