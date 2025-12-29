# Email Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email template system with 5 presets, brand settings, and preview functionality that works for both campaigns and sequences.

**Architecture:** Shared template engine in `lib/templates/` with presets as TypeScript files. Brand settings stored in D1. `renderEmail()` function used by both campaign-send and sequence-processor.

**Tech Stack:** TypeScript, Cloudflare Workers, D1 (SQLite), React (admin UI), Vitest

---

## Task 1: Database Schema - Add brand_settings table

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Modify: `workers/newsletter/src/__tests__/setup.ts`

**Step 1: Add brand_settings table to schema.sql**

Add after the `signup_pages` table definition:

```sql
-- Brand Settings table (Email Templates feature)
CREATE TABLE IF NOT EXISTS brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',
  secondary_color TEXT DEFAULT '#1e1e1e',
  footer_text TEXT DEFAULT 'EdgeShift Newsletter',
  default_template_id TEXT DEFAULT 'simple',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

**Step 2: Add template_id to campaigns table**

Add after existing columns:

```sql
-- Note: Run as ALTER TABLE for existing DB
-- ALTER TABLE campaigns ADD COLUMN template_id TEXT DEFAULT NULL;
```

**Step 3: Add template_id to sequence_steps table**

```sql
-- Note: Run as ALTER TABLE for existing DB
-- ALTER TABLE sequence_steps ADD COLUMN template_id TEXT DEFAULT NULL;
```

**Step 4: Update test setup.ts**

Add to `setupTestDb()` function after contact_list_members table:

```typescript
env.DB.prepare(`CREATE TABLE IF NOT EXISTS brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',
  secondary_color TEXT DEFAULT '#1e1e1e',
  footer_text TEXT DEFAULT 'EdgeShift Newsletter',
  default_template_id TEXT DEFAULT 'simple',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)`),
```

Add to `cleanupTestDb()`:

```typescript
env.DB.prepare('DELETE FROM brand_settings WHERE 1=1'),
```

**Step 5: Run local migration**

Run: `cd workers/newsletter && npm run db:migrate`
Expected: Schema applied successfully

**Step 6: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/src/__tests__/setup.ts
git commit -m "feat(templates): add brand_settings table and template_id columns

- Add brand_settings table for email template customization
- Add template_id column to campaigns (NULL = use default)
- Add template_id column to sequence_steps (NULL = use default)
- Update test setup for new table"
```

---

## Task 2: Types - Add template-related TypeScript types

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add BrandSettings interface**

Add after `ArchiveDetailResponse` interface:

```typescript
// Email Templates (Brand Settings)
export interface BrandSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
  default_template_id: string;
  created_at: number;
  updated_at: number;
}

export interface UpdateBrandSettingsRequest {
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  footer_text?: string;
  default_template_id?: string;
}

export type TemplateId = 'simple' | 'newsletter' | 'announcement' | 'welcome' | 'product-update';

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
}

export interface PreviewRequest {
  template_id: string;
  content: string;
  subject: string;
  brand_settings?: Partial<BrandSettings>;
}

export interface TestSendRequest {
  template_id: string;
  content: string;
  subject: string;
  to: string;
}
```

**Step 2: Update Campaign interface**

Add `template_id` field:

```typescript
export interface Campaign {
  id: string;
  subject: string;
  content: string;
  status: CampaignStatus;
  scheduled_at: number | null;
  schedule_type: ScheduleType | null;
  schedule_config: string | null;
  last_sent_at: number | null;
  sent_at: number | null;
  recipient_count: number | null;
  contact_list_id: string | null;
  template_id: string | null;  // NEW
  slug: string;
  excerpt: string;
  is_published: number;
  created_at: number;
}
```

**Step 3: Update SequenceStep interface**

Add `template_id` field:

```typescript
export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number | null;
  subject: string;
  content: string;
  template_id: string | null;  // NEW
  is_enabled: number;
  created_at: number;
}
```

**Step 4: Update CreateCampaignRequest**

```typescript
export interface CreateCampaignRequest {
  subject: string;
  content: string;
  scheduled_at?: number;
  schedule_type?: ScheduleType;
  schedule_config?: ScheduleConfig;
  contact_list_id?: string;
  template_id?: string;  // NEW
  slug?: string;
  excerpt?: string;
  is_published?: boolean;
}
```

**Step 5: Update UpdateCampaignRequest**

```typescript
export interface UpdateCampaignRequest {
  subject?: string;
  content?: string;
  status?: CampaignStatus;
  contact_list_id?: string;
  template_id?: string;  // NEW
  slug?: string;
  excerpt?: string;
  is_published?: boolean;
}
```

**Step 6: Update CreateSequenceRequest steps**

```typescript
export interface CreateSequenceRequest {
  name: string;
  description?: string;
  default_send_time: string;
  steps: {
    delay_days: number;
    delay_time?: string;
    delay_minutes?: number | null;
    subject: string;
    content: string;
    template_id?: string;  // NEW
  }[];
}
```

**Step 7: Update UpdateSequenceRequest steps**

```typescript
export interface UpdateSequenceRequest {
  name?: string;
  description?: string;
  default_send_time?: string;
  is_active?: number;
  steps?: {
    delay_days: number;
    delay_time?: string;
    delay_minutes?: number | null;
    subject: string;
    content: string;
    template_id?: string;  // NEW
  }[];
}
```

**Step 8: Commit**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(templates): add TypeScript types for email templates

- Add BrandSettings interface
- Add TemplateId, TemplateInfo types
- Add PreviewRequest, TestSendRequest interfaces
- Add template_id to Campaign and SequenceStep interfaces
- Update request interfaces for template_id"
```

---

## Task 3: Template Engine - Variable replacement

**Files:**
- Create: `workers/newsletter/src/lib/templates/variables.ts`
- Test: `workers/newsletter/src/__tests__/templates-variables.test.ts`

**Step 1: Write the failing test**

Create `workers/newsletter/src/__tests__/templates-variables.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { replaceVariables } from '../lib/templates/variables';

describe('replaceVariables', () => {
  it('should replace {{subscriber.name}} with name', () => {
    const result = replaceVariables('Hello {{subscriber.name}}!', {
      subscriberName: 'John',
      unsubscribeUrl: 'http://example.com/unsub',
    });
    expect(result).toBe('Hello John!');
  });

  it('should replace {{unsubscribe_url}} with URL', () => {
    const result = replaceVariables('Click {{unsubscribe_url}} to unsubscribe', {
      subscriberName: 'John',
      unsubscribeUrl: 'http://example.com/unsub/abc123',
    });
    expect(result).toBe('Click http://example.com/unsub/abc123 to unsubscribe');
  });

  it('should fallback to empty string when name is null', () => {
    const result = replaceVariables('Hello {{subscriber.name}}!', {
      subscriberName: null,
      unsubscribeUrl: 'http://example.com/unsub',
    });
    expect(result).toBe('Hello !');
  });

  it('should handle multiple variables', () => {
    const result = replaceVariables(
      '{{subscriber.name}}さん、配信停止は{{unsubscribe_url}}から',
      {
        subscriberName: '田中',
        unsubscribeUrl: 'http://example.com/unsub',
      }
    );
    expect(result).toBe('田中さん、配信停止はhttp://example.com/unsubから');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/templates-variables.test.ts`
Expected: FAIL - Cannot find module '../lib/templates/variables'

**Step 3: Write minimal implementation**

Create `workers/newsletter/src/lib/templates/variables.ts`:

```typescript
export interface VariableContext {
  subscriberName: string | null;
  unsubscribeUrl: string;
}

export function replaceVariables(template: string, context: VariableContext): string {
  return template
    .replace(/\{\{subscriber\.name\}\}/g, context.subscriberName ?? '')
    .replace(/\{\{unsubscribe_url\}\}/g, context.unsubscribeUrl);
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/templates-variables.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/templates/variables.ts workers/newsletter/src/__tests__/templates-variables.test.ts
git commit -m "feat(templates): add variable replacement engine

- Support {{subscriber.name}} variable
- Support {{unsubscribe_url}} variable
- Handle null name gracefully"
```

---

## Task 4: Template Engine - Preset templates

**Files:**
- Create: `workers/newsletter/src/lib/templates/presets/simple.ts`
- Create: `workers/newsletter/src/lib/templates/presets/newsletter.ts`
- Create: `workers/newsletter/src/lib/templates/presets/announcement.ts`
- Create: `workers/newsletter/src/lib/templates/presets/welcome.ts`
- Create: `workers/newsletter/src/lib/templates/presets/product-update.ts`
- Create: `workers/newsletter/src/lib/templates/presets/index.ts`

**Step 1: Create simple template**

Create `workers/newsletter/src/lib/templates/presets/simple.ts`:

```typescript
import type { BrandSettings } from '../../../types';

export interface PresetRenderOptions {
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriberName: string | null;
  unsubscribeUrl: string;
  siteUrl: string;
}

export function renderSimple(options: PresetRenderOptions): string {
  const { content, brandSettings, subscriberName, unsubscribeUrl, siteUrl } = options;
  const greeting = subscriberName ? `${subscriberName}さん、` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 16px;">
    ${greeting}
  </div>
  <div style="margin-bottom: 32px;">
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
```

**Step 2: Create newsletter template**

Create `workers/newsletter/src/lib/templates/presets/newsletter.ts`:

```typescript
import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    ${logoHtml}
    <h1 style="color: ${brandSettings.secondary_color}; font-size: 24px; margin: 0;">${subject}</h1>
  </div>
  <div style="margin-bottom: 32px;">
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
```

**Step 3: Create announcement template**

Create `workers/newsletter/src/lib/templates/presets/announcement.ts`:

```typescript
import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

export function renderAnnouncement(options: PresetRenderOptions): string {
  const { content, subject, brandSettings, unsubscribeUrl, siteUrl } = options;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${brandSettings.primary_color}; color: white; padding: 24px; text-align: center; border-radius: 8px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 28px;">📢 ${subject}</h1>
  </div>
  <div style="margin-bottom: 32px; padding: 0 16px;">
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
```

**Step 4: Create welcome template**

Create `workers/newsletter/src/lib/templates/presets/welcome.ts`:

```typescript
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
```

**Step 5: Create product-update template**

Create `workers/newsletter/src/lib/templates/presets/product-update.ts`:

```typescript
import type { BrandSettings } from '../../../types';
import type { PresetRenderOptions } from './simple';

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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${brandSettings.secondary_color}; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid ${brandSettings.primary_color};">
    ${logoHtml}
    <span style="background-color: ${brandSettings.primary_color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">UPDATE</span>
  </div>
  <h1 style="font-size: 24px; color: ${brandSettings.secondary_color}; margin-bottom: 24px;">🚀 ${subject}</h1>
  <div style="margin-bottom: 32px;">
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
```

**Step 6: Create presets index**

Create `workers/newsletter/src/lib/templates/presets/index.ts`:

```typescript
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
```

**Step 7: Commit**

```bash
git add workers/newsletter/src/lib/templates/presets/
git commit -m "feat(templates): add 5 preset email templates

- simple: text-focused minimal layout
- newsletter: header with logo, classic style
- announcement: emphasized banner style
- welcome: greeting for new subscribers
- product-update: feature update style with badge"
```

---

## Task 5: Template Engine - Main renderEmail function

**Files:**
- Create: `workers/newsletter/src/lib/templates/index.ts`
- Test: `workers/newsletter/src/__tests__/templates.test.ts`

**Step 1: Write the failing test**

Create `workers/newsletter/src/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderEmail, getDefaultBrandSettings } from '../lib/templates';
import type { BrandSettings } from '../types';

describe('Template Engine', () => {
  const defaultBrandSettings: BrandSettings = {
    id: 'default',
    logo_url: null,
    primary_color: '#7c3aed',
    secondary_color: '#1e1e1e',
    footer_text: 'EdgeShift Newsletter',
    default_template_id: 'simple',
    created_at: 0,
    updated_at: 0,
  };

  describe('renderEmail', () => {
    it('should render simple template with brand settings', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'Hello World',
        subject: 'Test Subject',
        brandSettings: defaultBrandSettings,
        subscriber: { name: 'John', email: 'john@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('Hello World');
      expect(html).toContain('#7c3aed');
      expect(html).toContain('EdgeShift Newsletter');
      expect(html).toContain('http://example.com/unsub');
    });

    it('should replace {{subscriber.name}} variable', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'こんにちは、{{subscriber.name}}さん',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: '田中', email: 'tanaka@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('こんにちは、田中さん');
      expect(html).not.toContain('{{subscriber.name}}');
    });

    it('should replace {{unsubscribe_url}} variable', () => {
      const html = renderEmail({
        templateId: 'simple',
        content: 'Unsubscribe: {{unsubscribe_url}}',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub/abc123',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('Unsubscribe: http://example.com/unsub/abc123');
    });

    it('should apply primary_color to links', () => {
      const customSettings = { ...defaultBrandSettings, primary_color: '#ff0000' };
      const html = renderEmail({
        templateId: 'simple',
        content: 'Test',
        subject: 'Test',
        brandSettings: customSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('#ff0000');
    });

    it('should include footer_text', () => {
      const customSettings = { ...defaultBrandSettings, footer_text: 'My Newsletter' };
      const html = renderEmail({
        templateId: 'simple',
        content: 'Test',
        subject: 'Test',
        brandSettings: customSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('My Newsletter');
    });

    it('should fallback to simple when template not found', () => {
      const html = renderEmail({
        templateId: 'nonexistent' as any,
        content: 'Test Content',
        subject: 'Test',
        brandSettings: defaultBrandSettings,
        subscriber: { name: null, email: 'test@example.com' },
        unsubscribeUrl: 'http://example.com/unsub',
        siteUrl: 'http://example.com',
      });

      expect(html).toContain('Test Content');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('getDefaultBrandSettings', () => {
    it('should return default values', () => {
      const settings = getDefaultBrandSettings();
      expect(settings.primary_color).toBe('#7c3aed');
      expect(settings.secondary_color).toBe('#1e1e1e');
      expect(settings.footer_text).toBe('EdgeShift Newsletter');
      expect(settings.default_template_id).toBe('simple');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/templates.test.ts`
Expected: FAIL - Cannot find module '../lib/templates'

**Step 3: Write implementation**

Create `workers/newsletter/src/lib/templates/index.ts`:

```typescript
import type { BrandSettings, TemplateId, TemplateInfo } from '../../types';
import { replaceVariables } from './variables';
import { renderPreset, isValidTemplateId, TEMPLATE_LIST } from './presets';

export interface RenderEmailOptions {
  templateId: string;
  content: string;
  subject: string;
  brandSettings: BrandSettings;
  subscriber: { name: string | null; email: string };
  unsubscribeUrl: string;
  siteUrl: string;
}

export function renderEmail(options: RenderEmailOptions): string {
  const { templateId, content, subject, brandSettings, subscriber, unsubscribeUrl, siteUrl } = options;

  // Replace variables in content first
  const processedContent = replaceVariables(content, {
    subscriberName: subscriber.name,
    unsubscribeUrl,
  });

  // Validate and get template ID
  const validTemplateId: TemplateId = isValidTemplateId(templateId) ? templateId : 'simple';

  // Render using preset
  return renderPreset(validTemplateId, {
    content: processedContent,
    subject,
    brandSettings,
    subscriberName: subscriber.name,
    unsubscribeUrl,
    siteUrl,
  });
}

export function getDefaultBrandSettings(): BrandSettings {
  return {
    id: 'default',
    logo_url: null,
    primary_color: '#7c3aed',
    secondary_color: '#1e1e1e',
    footer_text: 'EdgeShift Newsletter',
    default_template_id: 'simple',
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };
}

export function getTemplateList(): TemplateInfo[] {
  return TEMPLATE_LIST;
}

export { isValidTemplateId };
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/templates/index.ts workers/newsletter/src/__tests__/templates.test.ts
git commit -m "feat(templates): add main renderEmail function

- Compose variable replacement and preset rendering
- Provide getDefaultBrandSettings helper
- Fallback to simple template for invalid IDs"
```

---

## Task 6: Brand Settings API - GET and PUT endpoints

**Files:**
- Create: `workers/newsletter/src/routes/brand-settings.ts`
- Modify: `workers/newsletter/src/index.ts`
- Test: `workers/newsletter/src/__tests__/brand-settings.test.ts`

**Step 1: Write the failing test**

Create `workers/newsletter/src/__tests__/brand-settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Brand Settings API', () => {
  const env = getTestEnv();

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/brand-settings', () => {
    it('should return default settings when none exist', async () => {
      const { getBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.primary_color).toBe('#7c3aed');
      expect(data.data.default_template_id).toBe('simple');
    });

    it('should return saved settings', async () => {
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, primary_color, footer_text)
        VALUES ('default', '#ff0000', 'Custom Footer')
      `).run();

      const { getBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.primary_color).toBe('#ff0000');
      expect(data.data.footer_text).toBe('Custom Footer');
    });
  });

  describe('PUT /api/brand-settings', () => {
    it('should create settings if none exist', async () => {
      const { updateBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary_color: '#00ff00', footer_text: 'New Footer' }),
      });

      const response = await updateBrandSettings(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.primary_color).toBe('#00ff00');
      expect(data.data.footer_text).toBe('New Footer');
    });

    it('should reject unauthorized requests', async () => {
      const { updateBrandSettings } = await import('../routes/brand-settings');
      const request = new Request('http://localhost/api/brand-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_color: '#00ff00' }),
      });

      const response = await updateBrandSettings(request, env);
      expect(response.status).toBe(401);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/brand-settings.test.ts`
Expected: FAIL - Cannot find module '../routes/brand-settings'

**Step 3: Write implementation**

Create `workers/newsletter/src/routes/brand-settings.ts`:

```typescript
import type { Env, BrandSettings, UpdateBrandSettingsRequest } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse, successResponse } from '../lib/response';
import { getDefaultBrandSettings } from '../lib/templates';

export async function getBrandSettings(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const settings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!settings) {
      return successResponse(getDefaultBrandSettings());
    }

    return successResponse(settings);
  } catch (error) {
    console.error('Get brand settings error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function updateBrandSettings(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: UpdateBrandSettingsRequest = await request.json();
    const now = Math.floor(Date.now() / 1000);

    const existing = await env.DB.prepare(
      'SELECT id FROM brand_settings WHERE id = ?'
    ).bind('default').first();

    if (existing) {
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (body.logo_url !== undefined) {
        updates.push('logo_url = ?');
        values.push(body.logo_url);
      }
      if (body.primary_color !== undefined) {
        updates.push('primary_color = ?');
        values.push(body.primary_color);
      }
      if (body.secondary_color !== undefined) {
        updates.push('secondary_color = ?');
        values.push(body.secondary_color);
      }
      if (body.footer_text !== undefined) {
        updates.push('footer_text = ?');
        values.push(body.footer_text);
      }
      if (body.default_template_id !== undefined) {
        updates.push('default_template_id = ?');
        values.push(body.default_template_id);
      }

      updates.push('updated_at = ?');
      values.push(now);
      values.push('default');

      await env.DB.prepare(
        `UPDATE brand_settings SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();
    } else {
      const defaults = getDefaultBrandSettings();
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, logo_url, primary_color, secondary_color, footer_text, default_template_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'default',
        body.logo_url ?? defaults.logo_url,
        body.primary_color ?? defaults.primary_color,
        body.secondary_color ?? defaults.secondary_color,
        body.footer_text ?? defaults.footer_text,
        body.default_template_id ?? defaults.default_template_id,
        now,
        now
      ).run();
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    return successResponse(updated);
  } catch (error) {
    console.error('Update brand settings error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Add routes to index.ts**

Add import at top:

```typescript
import { getBrandSettings, updateBrandSettings } from './routes/brand-settings';
```

Add route handling before "Newsletter routes" section:

```typescript
// Brand Settings routes (Email Templates)
else if (path === '/api/brand-settings' && request.method === 'GET') {
  response = await getBrandSettings(request, env);
} else if (path === '/api/brand-settings' && request.method === 'PUT') {
  response = await updateBrandSettings(request, env);
}
```

**Step 5: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/brand-settings.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/brand-settings.ts workers/newsletter/src/index.ts workers/newsletter/src/__tests__/brand-settings.test.ts
git commit -m "feat(templates): add brand settings API

- GET /api/brand-settings returns current or default settings
- PUT /api/brand-settings creates/updates settings
- Upsert logic for single-row brand_settings table"
```

---

## Task 7: Templates List and Preview API

**Files:**
- Create: `workers/newsletter/src/routes/templates.ts`
- Modify: `workers/newsletter/src/index.ts`
- Test: `workers/newsletter/src/__tests__/templates-api.test.ts`

**Step 1: Write the failing test**

Create `workers/newsletter/src/__tests__/templates-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('Templates API', () => {
  const env = getTestEnv();

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/templates', () => {
    it('should return list of available templates', async () => {
      const { getTemplates } = await import('../routes/templates');
      const request = new Request('http://localhost/api/templates', {
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await getTemplates(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(5);
      expect(data.data[0]).toHaveProperty('id');
      expect(data.data[0]).toHaveProperty('name');
      expect(data.data[0]).toHaveProperty('description');
    });
  });

  describe('POST /api/templates/preview', () => {
    it('should render preview HTML', async () => {
      const { previewTemplate } = await import('../routes/templates');
      const request = new Request('http://localhost/api/templates/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: 'simple',
          content: 'Hello World',
          subject: 'Test Subject',
        }),
      });

      const response = await previewTemplate(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.html).toContain('Hello World');
      expect(data.data.html).toContain('<!DOCTYPE html>');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npm test src/__tests__/templates-api.test.ts`
Expected: FAIL

**Step 3: Write implementation**

Create `workers/newsletter/src/routes/templates.ts`:

```typescript
import type { Env, BrandSettings, PreviewRequest, TestSendRequest } from '../types';
import { isAuthorized } from '../lib/auth';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmail, getDefaultBrandSettings, getTemplateList } from '../lib/templates';
import { sendEmail } from '../lib/email';

export async function getTemplates(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  return successResponse(getTemplateList());
}

export async function previewTemplate(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: PreviewRequest = await request.json();

    if (!body.template_id || !body.content) {
      return errorResponse('template_id and content are required', 400);
    }

    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    if (body.brand_settings) {
      brandSettings = { ...brandSettings, ...body.brand_settings };
    }

    const html = renderEmail({
      templateId: body.template_id,
      content: body.content,
      subject: body.subject || 'Preview',
      brandSettings,
      subscriber: { name: 'プレビューユーザー', email: 'preview@example.com' },
      unsubscribeUrl: `${env.SITE_URL}/unsubscribe/preview`,
      siteUrl: env.SITE_URL,
    });

    return successResponse({ html });
  } catch (error) {
    console.error('Preview template error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function testSendTemplate(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: TestSendRequest = await request.json();

    if (!body.template_id || !body.content || !body.to) {
      return errorResponse('template_id, content, and to are required', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return errorResponse('Invalid email address', 400);
    }

    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const html = renderEmail({
      templateId: body.template_id,
      content: body.content,
      subject: body.subject || 'テストメール',
      brandSettings,
      subscriber: { name: 'テスト送信者', email: body.to },
      unsubscribeUrl: `${env.SITE_URL}/unsubscribe/test`,
      siteUrl: env.SITE_URL,
    });

    const result = await sendEmail(
      env.RESEND_API_KEY,
      `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
      {
        to: body.to,
        subject: `[テスト] ${body.subject || 'テストメール'}`,
        html,
      }
    );

    if (!result.success) {
      return errorResponse(result.error || 'Failed to send test email', 500);
    }

    return successResponse({ message_id: result.id });
  } catch (error) {
    console.error('Test send error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

**Step 4: Add routes to index.ts**

Add import and routes:

```typescript
import { getTemplates, previewTemplate, testSendTemplate } from './routes/templates';

// Templates routes
else if (path === '/api/templates' && request.method === 'GET') {
  response = await getTemplates(request, env);
} else if (path === '/api/templates/preview' && request.method === 'POST') {
  response = await previewTemplate(request, env);
} else if (path === '/api/templates/test-send' && request.method === 'POST') {
  response = await testSendTemplate(request, env);
}
```

**Step 5: Run test to verify it passes**

Run: `cd workers/newsletter && npm test src/__tests__/templates-api.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/templates.ts workers/newsletter/src/index.ts workers/newsletter/src/__tests__/templates-api.test.ts
git commit -m "feat(templates): add templates list, preview, and test-send APIs

- GET /api/templates returns available preset list
- POST /api/templates/preview renders HTML with sample data
- POST /api/templates/test-send sends actual test email"
```

---

## Task 8: Integrate template engine with campaign-send

**Files:**
- Modify: `workers/newsletter/src/routes/campaign-send.ts`

**Step 1: Update imports**

Replace imports at top:

```typescript
import type { Env, Campaign, Subscriber, BrandSettings } from '../types';
import { isAuthorized } from '../lib/auth';
import { sendBatchEmails } from '../lib/email';
import { recordDeliveryLogs, getDeliveryStats } from '../lib/delivery';
import { errorResponse, successResponse } from '../lib/response';
import { renderEmail, getDefaultBrandSettings } from '../lib/templates';
```

**Step 2: Remove old functions**

Delete `linkifyUrls` and `buildNewsletterEmail` functions.

**Step 3: Update sendCampaign function**

Replace email preparation section with:

```typescript
    // Get brand settings
    let brandSettings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!brandSettings) {
      brandSettings = getDefaultBrandSettings();
    }

    const templateId = campaign.template_id || brandSettings.default_template_id;

    const emails = subscribers.map((sub) => ({
      to: sub.email,
      subject: campaign.subject,
      html: renderEmail({
        templateId,
        content: campaign.content,
        subject: campaign.subject,
        brandSettings,
        subscriber: { name: sub.name, email: sub.email },
        unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${sub.unsubscribe_token}`,
        siteUrl: env.SITE_URL,
      }),
    }));
```

**Step 4: Run tests**

Run: `cd workers/newsletter && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/campaign-send.ts
git commit -m "refactor(templates): integrate template engine with campaign-send

- Replace hardcoded buildNewsletterEmail with renderEmail
- Support campaign.template_id with fallback to default
- Fetch brand_settings for customization"
```

---

## Task 9: Integrate template engine with sequence-processor

**Files:**
- Modify: `workers/newsletter/src/lib/sequence-processor.ts`

**Step 1: Update imports**

Add at top:

```typescript
import type { BrandSettings } from '../types';
import { renderEmail, getDefaultBrandSettings } from './templates';
```

**Step 2: Remove buildSequenceEmail function**

Delete the `buildSequenceEmail` function.

**Step 3: Update processSequenceEmails**

Before sendEmail call, add brand settings and template handling:

```typescript
      let brandSettings = await env.DB.prepare(
        'SELECT * FROM brand_settings WHERE id = ?'
      ).bind('default').first<BrandSettings>();

      if (!brandSettings) {
        brandSettings = getDefaultBrandSettings();
      }

      const stepWithTemplate = await env.DB.prepare(
        'SELECT template_id FROM sequence_steps WHERE id = ?'
      ).bind(email.step_id).first<{ template_id: string | null }>();

      const templateId = stepWithTemplate?.template_id || brandSettings.default_template_id;

      const result = await sendEmail(
        env.RESEND_API_KEY,
        `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        {
          to: email.email,
          subject: email.subject,
          html: renderEmail({
            templateId,
            content: email.content,
            subject: email.subject,
            brandSettings,
            subscriber: { name: email.name, email: email.email },
            unsubscribeUrl: `${env.SITE_URL}/api/newsletter/unsubscribe/${email.unsubscribe_token}`,
            siteUrl: env.SITE_URL,
          }),
        }
      );
```

**Step 4: Run tests**

Run: `cd workers/newsletter && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/sequence-processor.ts
git commit -m "refactor(templates): integrate template engine with sequence-processor

- Replace hardcoded buildSequenceEmail with renderEmail
- Support step.template_id with fallback to default
- Shared template rendering between campaigns and sequences"
```

---

## Task 10-16: Frontend Implementation

(See design document for detailed UI specifications)

**Summary of remaining tasks:**
- Task 10: Update Campaign/Sequence APIs for template_id
- Task 11: Frontend Admin API functions
- Task 12: Brand Settings Page
- Task 13: Preview Modal Component
- Task 14: Campaign Form Integration
- Task 15: Production DB migration
- Task 16: Final verification

---

## Summary

**Total Tasks:** 16
**Key Files Created:**
- `workers/newsletter/src/lib/templates/` - Template engine
- `workers/newsletter/src/routes/brand-settings.ts` - Brand settings API
- `workers/newsletter/src/routes/templates.ts` - Templates API
- `src/components/admin/BrandSettingsForm.tsx` - Admin UI
- `src/components/admin/TemplatePreviewModal.tsx` - Preview modal

**Key Files Modified:**
- `workers/newsletter/src/routes/campaign-send.ts` - Use template engine
- `workers/newsletter/src/lib/sequence-processor.ts` - Use template engine
- `workers/newsletter/src/index.ts` - Add routes
- `src/utils/admin-api.ts` - Add API functions
