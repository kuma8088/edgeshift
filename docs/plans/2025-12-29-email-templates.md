# Email Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ハイブリッド保存（プリセット=ファイル、カスタム=DB）のメールテンプレートシステムを実装し、Liquid風変数でパーソナライズ可能にする

**Architecture:** 5種類のプリセットテンプレートをTypeScriptファイルで定義し、ブランド設定とカスタムテンプレートはDBに保存。変数展開はサーバーサイドで実行。

**Tech Stack:** TypeScript, Cloudflare D1, Astro + React

---

## Phase 1: プリセットテンプレート定義

### Task 1.1: テンプレート型定義の作成

**Files:**
- Create: `workers/newsletter/src/lib/templates/types.ts`

**Step 1: Write the failing test**

```typescript
// workers/newsletter/src/__tests__/templates.test.ts
import { describe, it, expect } from 'vitest';
import type { EmailTemplate, TemplateVariable } from '../lib/templates/types';

describe('Email Template Types', () => {
  it('should define template structure', () => {
    const template: EmailTemplate = {
      id: 'simple',
      name: 'シンプル',
      description: 'ミニマルなテキスト重視のデザイン',
      category: 'preset',
      html: '<html>{{content}}</html>',
      variables: ['content', 'subscriber.name', 'unsubscribe_url'],
    };
    expect(template.id).toBe('simple');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// workers/newsletter/src/lib/templates/types.ts
export type TemplateCategory = 'preset' | 'custom';

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  html: string;
  variables: string[];
  thumbnail?: string;
}

export interface BrandSettings {
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  footer_text?: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

export const AVAILABLE_VARIABLES: TemplateVariable[] = [
  { name: 'content', description: 'メール本文', example: 'こんにちは！' },
  { name: 'subscriber.name', description: '購読者名', example: '山田太郎' },
  { name: 'subscriber.email', description: '購読者メール', example: 'user@example.com' },
  { name: 'unsubscribe_url', description: '配信停止URL', example: 'https://...' },
  { name: 'brand.logo', description: 'ブランドロゴURL', example: 'https://...' },
  { name: 'brand.color', description: 'ブランドカラー', example: '#7c3aed' },
  { name: 'site_url', description: 'サイトURL', example: 'https://edgeshift.tech' },
];
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/templates/types.ts workers/newsletter/src/__tests__/templates.test.ts
git commit -m "feat(templates): add type definitions for email templates"
```

---

### Task 1.2: 5種類のプリセットテンプレート作成

**Files:**
- Create: `workers/newsletter/src/lib/templates/presets/simple.ts`
- Create: `workers/newsletter/src/lib/templates/presets/newsletter.ts`
- Create: `workers/newsletter/src/lib/templates/presets/announcement.ts`
- Create: `workers/newsletter/src/lib/templates/presets/welcome.ts`
- Create: `workers/newsletter/src/lib/templates/presets/product.ts`
- Create: `workers/newsletter/src/lib/templates/presets/index.ts`

**Step 1: Write the failing test**

```typescript
// workers/newsletter/src/__tests__/templates.test.ts (append)
import { PRESET_TEMPLATES, getPresetTemplate } from '../lib/templates/presets';

describe('Preset Templates', () => {
  it('should have 5 preset templates', () => {
    expect(PRESET_TEMPLATES).toHaveLength(5);
  });

  it('should get simple template by id', () => {
    const template = getPresetTemplate('simple');
    expect(template?.name).toBe('シンプル');
    expect(template?.html).toContain('{{content}}');
  });

  it('should return undefined for unknown template', () => {
    const template = getPresetTemplate('unknown');
    expect(template).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// workers/newsletter/src/lib/templates/presets/simple.ts
import type { EmailTemplate } from '../types';

export const simpleTemplate: EmailTemplate = {
  id: 'simple',
  name: 'シンプル',
  description: 'ミニマルなテキスト重視のデザイン',
  category: 'preset',
  variables: ['content', 'subscriber.name', 'unsubscribe_url', 'brand.color', 'site_url'],
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="margin-bottom: 32px;">
    {{content}}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="{{site_url}}" style="color: {{brand.color}};">EdgeShift</a><br>
    <a href="{{unsubscribe_url}}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>`,
};
```

```typescript
// workers/newsletter/src/lib/templates/presets/newsletter.ts
import type { EmailTemplate } from '../types';

export const newsletterTemplate: EmailTemplate = {
  id: 'newsletter',
  name: 'ニュースレター',
  description: 'ヘッダー付きの標準的なニュースレター',
  category: 'preset',
  variables: ['content', 'subscriber.name', 'unsubscribe_url', 'brand.logo', 'brand.color', 'site_url'],
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
  <div style="background-color: {{brand.color}}; padding: 24px; text-align: center;">
    {{#if brand.logo}}
    <img src="{{brand.logo}}" alt="Logo" style="max-height: 40px;">
    {{else}}
    <h1 style="color: #ffffff; font-size: 24px; margin: 0;">EdgeShift Newsletter</h1>
    {{/if}}
  </div>
  <div style="background-color: #ffffff; padding: 32px;">
    {{content}}
  </div>
  <div style="padding: 24px; text-align: center; color: #a3a3a3; font-size: 12px;">
    <a href="{{site_url}}" style="color: {{brand.color}};">EdgeShift</a><br>
    <a href="{{unsubscribe_url}}" style="color: #a3a3a3;">配信停止はこちら</a>
  </div>
</body>
</html>`,
};
```

```typescript
// workers/newsletter/src/lib/templates/presets/announcement.ts
import type { EmailTemplate } from '../types';

export const announcementTemplate: EmailTemplate = {
  id: 'announcement',
  name: 'お知らせ',
  description: '重要なお知らせ用の目立つデザイン',
  category: 'preset',
  variables: ['content', 'subscriber.name', 'unsubscribe_url', 'brand.color', 'site_url'],
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="border-left: 4px solid {{brand.color}}; padding-left: 20px; margin-bottom: 32px;">
    <h2 style="color: {{brand.color}}; margin-top: 0;">📢 お知らせ</h2>
    {{content}}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="{{site_url}}" style="color: {{brand.color}};">EdgeShift</a><br>
    <a href="{{unsubscribe_url}}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>`,
};
```

```typescript
// workers/newsletter/src/lib/templates/presets/welcome.ts
import type { EmailTemplate } from '../types';

export const welcomeTemplate: EmailTemplate = {
  id: 'welcome',
  name: 'ウェルカム',
  description: '新規購読者向けの歓迎メール',
  category: 'preset',
  variables: ['content', 'subscriber.name', 'unsubscribe_url', 'brand.logo', 'brand.color', 'site_url'],
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 32px;">
    {{#if brand.logo}}
    <img src="{{brand.logo}}" alt="Logo" style="max-height: 60px; margin-bottom: 16px;">
    {{/if}}
    <h1 style="color: {{brand.color}}; margin: 0;">ようこそ！ 🎉</h1>
    {{#if subscriber.name}}
    <p style="font-size: 18px; color: #525252;">{{subscriber.name}}さん</p>
    {{/if}}
  </div>
  <div style="margin-bottom: 32px;">
    {{content}}
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
  <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
    <a href="{{site_url}}" style="color: {{brand.color}};">EdgeShift</a><br>
    <a href="{{unsubscribe_url}}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>`,
};
```

```typescript
// workers/newsletter/src/lib/templates/presets/product.ts
import type { EmailTemplate } from '../types';

export const productTemplate: EmailTemplate = {
  id: 'product',
  name: 'プロダクト',
  description: '製品・サービス紹介用のカード型デザイン',
  category: 'preset',
  variables: ['content', 'subscriber.name', 'unsubscribe_url', 'brand.logo', 'brand.color', 'site_url'],
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, {{brand.color}} 0%, #4c1d95 100%); padding: 32px; text-align: center;">
      {{#if brand.logo}}
      <img src="{{brand.logo}}" alt="Logo" style="max-height: 40px;">
      {{else}}
      <h1 style="color: #ffffff; font-size: 24px; margin: 0;">新機能のご紹介</h1>
      {{/if}}
    </div>
    <div style="padding: 32px;">
      {{content}}
    </div>
  </div>
  <p style="color: #a3a3a3; font-size: 12px; text-align: center; margin-top: 24px;">
    <a href="{{site_url}}" style="color: {{brand.color}};">EdgeShift</a><br>
    <a href="{{unsubscribe_url}}" style="color: #a3a3a3;">配信停止はこちら</a>
  </p>
</body>
</html>`,
};
```

```typescript
// workers/newsletter/src/lib/templates/presets/index.ts
import type { EmailTemplate } from '../types';
import { simpleTemplate } from './simple';
import { newsletterTemplate } from './newsletter';
import { announcementTemplate } from './announcement';
import { welcomeTemplate } from './welcome';
import { productTemplate } from './product';

export const PRESET_TEMPLATES: EmailTemplate[] = [
  simpleTemplate,
  newsletterTemplate,
  announcementTemplate,
  welcomeTemplate,
  productTemplate,
];

export function getPresetTemplate(id: string): EmailTemplate | undefined {
  return PRESET_TEMPLATES.find(t => t.id === id);
}

export {
  simpleTemplate,
  newsletterTemplate,
  announcementTemplate,
  welcomeTemplate,
  productTemplate,
};
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/templates/presets/
git commit -m "feat(templates): add 5 preset email templates"
```

---

## Phase 2: 変数展開エンジン

### Task 2.1: 変数展開関数の実装

**Files:**
- Create: `workers/newsletter/src/lib/templates/renderer.ts`
- Modify: `workers/newsletter/src/__tests__/templates.test.ts`

**Step 1: Write the failing test**

```typescript
// workers/newsletter/src/__tests__/templates.test.ts (append)
import { renderTemplate } from '../lib/templates/renderer';

describe('Template Renderer', () => {
  it('should replace simple variables', () => {
    const html = 'Hello {{subscriber.name}}!';
    const result = renderTemplate(html, {
      subscriber: { name: '太郎', email: 'taro@example.com' },
    });
    expect(result).toBe('Hello 太郎!');
  });

  it('should handle nested variables', () => {
    const html = 'Color: {{brand.color}}';
    const result = renderTemplate(html, {
      brand: { color: '#7c3aed' },
    });
    expect(result).toBe('Color: #7c3aed');
  });

  it('should handle missing variables gracefully', () => {
    const html = 'Hello {{subscriber.name}}!';
    const result = renderTemplate(html, {});
    expect(result).toBe('Hello !');
  });

  it('should handle if blocks', () => {
    const html = '{{#if subscriber.name}}Hi {{subscriber.name}}{{else}}Hi there{{/if}}';
    const withName = renderTemplate(html, { subscriber: { name: 'Bob' } });
    const withoutName = renderTemplate(html, { subscriber: {} });
    expect(withName).toBe('Hi Bob');
    expect(withoutName).toBe('Hi there');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// workers/newsletter/src/lib/templates/renderer.ts
export interface TemplateContext {
  content?: string;
  subscriber?: {
    name?: string;
    email?: string;
  };
  brand?: {
    logo?: string;
    color?: string;
  };
  unsubscribe_url?: string;
  site_url?: string;
  [key: string]: unknown;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

/**
 * Process {{#if var}}...{{else}}...{{/if}} blocks
 */
function processIfBlocks(html: string, context: TemplateContext): string {
  const ifPattern = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return html.replace(ifPattern, (_, condition, content) => {
    const value = getNestedValue(context as Record<string, unknown>, condition.trim());
    const hasElse = content.includes('{{else}}');

    if (hasElse) {
      const [ifContent, elseContent] = content.split('{{else}}');
      return value ? ifContent : elseContent;
    }

    return value ? content : '';
  });
}

/**
 * Replace {{variable}} placeholders with values from context
 */
function replaceVariables(html: string, context: TemplateContext): string {
  const variablePattern = /\{\{([^#/][^}]*)\}\}/g;

  return html.replace(variablePattern, (_, variable) => {
    const value = getNestedValue(context as Record<string, unknown>, variable.trim());
    return value !== undefined ? String(value) : '';
  });
}

/**
 * Render template with given context
 */
export function renderTemplate(html: string, context: TemplateContext): string {
  // First process if blocks
  let result = processIfBlocks(html, context);
  // Then replace variables
  result = replaceVariables(result, context);
  return result;
}

/**
 * Build full template context from subscriber and brand settings
 */
export function buildTemplateContext(
  content: string,
  subscriber: { name?: string; email?: string },
  unsubscribeUrl: string,
  siteUrl: string,
  brand?: { logo_url?: string; primary_color?: string }
): TemplateContext {
  return {
    content,
    subscriber: {
      name: subscriber.name || '',
      email: subscriber.email || '',
    },
    brand: {
      logo: brand?.logo_url || '',
      color: brand?.primary_color || '#7c3aed',
    },
    unsubscribe_url: unsubscribeUrl,
    site_url: siteUrl,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd workers/newsletter && npx vitest run src/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/templates/renderer.ts workers/newsletter/src/__tests__/templates.test.ts
git commit -m "feat(templates): implement variable rendering engine"
```

---

## Phase 3: ブランド設定 DB スキーマ

### Task 3.1: brand_settings テーブル追加

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Create: `workers/newsletter/migrations/005_email_templates.sql`

**Step 1: Write the migration SQL**

```sql
-- workers/newsletter/migrations/005_email_templates.sql
-- Migration: Email Templates
-- Date: 2025-12-29
-- Description: Add brand settings and custom templates

-- Brand settings table (singleton - only one row)
CREATE TABLE IF NOT EXISTS brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',
  secondary_color TEXT DEFAULT '#4c1d95',
  footer_text TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Custom email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  html TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Insert default brand settings
INSERT OR IGNORE INTO brand_settings (id, primary_color, secondary_color)
VALUES ('default', '#7c3aed', '#4c1d95');
```

**Step 2: Update schema.sql**

Add the same table definitions to `schema.sql`.

**Step 3: Apply migration locally**

Run: `cd workers/newsletter && npm run db:migrate`
Expected: Tables created

**Step 4: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/migrations/005_email_templates.sql
git commit -m "feat(templates): add brand_settings and email_templates tables"
```

---

## Phase 4: API エンドポイント

### Task 4.1: ブランド設定 API

**Files:**
- Create: `workers/newsletter/src/routes/templates.ts`
- Modify: `workers/newsletter/src/index.ts`
- Modify: `workers/newsletter/src/types.ts`

**Step 1: Add types**

```typescript
// workers/newsletter/src/types.ts (append)
export interface BrandSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string | null;
  updated_at: number;
}

export interface CustomEmailTemplate {
  id: string;
  name: string;
  description: string | null;
  html: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface UpdateBrandSettingsRequest {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  footer_text?: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  html: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  html?: string;
  is_active?: boolean;
}
```

**Step 2: Implement route handlers**

```typescript
// workers/newsletter/src/routes/templates.ts
import type { Env, ApiResponse, BrandSettings, CustomEmailTemplate } from '../types';
import { PRESET_TEMPLATES, getPresetTemplate } from '../lib/templates/presets';
import { renderTemplate, buildTemplateContext } from '../lib/templates/renderer';

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/templates/presets - List preset templates
export async function handleGetPresets(request: Request, env: Env): Promise<Response> {
  return jsonResponse<ApiResponse>({
    success: true,
    data: PRESET_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      variables: t.variables,
    })),
  });
}

// GET /api/templates/presets/:id - Get preset template
export async function handleGetPreset(request: Request, env: Env, id: string): Promise<Response> {
  const template = getPresetTemplate(id);
  if (!template) {
    return jsonResponse<ApiResponse>({ success: false, error: 'Template not found' }, 404);
  }
  return jsonResponse<ApiResponse>({ success: true, data: template });
}

// GET /api/brand-settings - Get brand settings
export async function handleGetBrandSettings(request: Request, env: Env): Promise<Response> {
  try {
    const settings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    return jsonResponse<ApiResponse>({
      success: true,
      data: settings || { id: 'default', primary_color: '#7c3aed', secondary_color: '#4c1d95' },
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({ success: false, error: 'Failed to get brand settings' }, 500);
  }
}

// PUT /api/brand-settings - Update brand settings
export async function handleUpdateBrandSettings(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<UpdateBrandSettingsRequest>();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(`
      INSERT INTO brand_settings (id, logo_url, primary_color, secondary_color, footer_text, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        logo_url = COALESCE(?, logo_url),
        primary_color = COALESCE(?, primary_color),
        secondary_color = COALESCE(?, secondary_color),
        footer_text = COALESCE(?, footer_text),
        updated_at = ?
    `).bind(
      body.logo_url || null,
      body.primary_color || '#7c3aed',
      body.secondary_color || '#4c1d95',
      body.footer_text || null,
      now,
      body.logo_url,
      body.primary_color,
      body.secondary_color,
      body.footer_text,
      now
    ).run();

    const settings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    return jsonResponse<ApiResponse>({ success: true, data: settings });
  } catch (error) {
    return jsonResponse<ApiResponse>({ success: false, error: 'Failed to update brand settings' }, 500);
  }
}

// POST /api/templates/preview - Preview template with sample data
export async function handlePreviewTemplate(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ templateId?: string; html?: string; content: string }>();

    let templateHtml: string;
    if (body.html) {
      templateHtml = body.html;
    } else if (body.templateId) {
      const preset = getPresetTemplate(body.templateId);
      if (!preset) {
        return jsonResponse<ApiResponse>({ success: false, error: 'Template not found' }, 404);
      }
      templateHtml = preset.html;
    } else {
      return jsonResponse<ApiResponse>({ success: false, error: 'templateId or html required' }, 400);
    }

    // Get brand settings
    const brand = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    const context = buildTemplateContext(
      body.content,
      { name: 'サンプル 太郎', email: 'sample@example.com' },
      'https://example.com/unsubscribe/xxx',
      env.SITE_URL,
      { logo_url: brand?.logo_url || undefined, primary_color: brand?.primary_color }
    );

    const rendered = renderTemplate(templateHtml, context);

    return jsonResponse<ApiResponse>({ success: true, data: { html: rendered } });
  } catch (error) {
    return jsonResponse<ApiResponse>({ success: false, error: 'Failed to preview template' }, 500);
  }
}
```

**Step 3: Register routes in index.ts**

Add route handlers for:
- `GET /api/templates/presets`
- `GET /api/templates/presets/:id`
- `GET /api/brand-settings`
- `PUT /api/brand-settings`
- `POST /api/templates/preview`

**Step 4: Write tests and verify**

Run: `cd workers/newsletter && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add workers/newsletter/src/routes/templates.ts workers/newsletter/src/index.ts workers/newsletter/src/types.ts
git commit -m "feat(templates): add template and brand settings API endpoints"
```

---

## Phase 5: campaign-send.ts 統合

### Task 5.1: sendCampaign でテンプレート使用

**Files:**
- Modify: `workers/newsletter/src/routes/campaign-send.ts`

**Step 1: Update buildNewsletterEmail to use templates**

```typescript
// Replace hardcoded buildNewsletterEmail with template-based version
import { getPresetTemplate } from '../lib/templates/presets';
import { renderTemplate, buildTemplateContext } from '../lib/templates/renderer';

async function buildEmailWithTemplate(
  env: Env,
  templateId: string | null,
  content: string,
  subscriber: { name?: string; email: string },
  unsubscribeUrl: string
): Promise<string> {
  // Get brand settings
  const brand = await env.DB.prepare(
    'SELECT * FROM brand_settings WHERE id = ?'
  ).bind('default').first<BrandSettings>();

  // Get template (default to 'newsletter' if not specified)
  const template = getPresetTemplate(templateId || 'newsletter');
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const context = buildTemplateContext(
    linkifyUrls(content),
    subscriber,
    unsubscribeUrl,
    env.SITE_URL,
    { logo_url: brand?.logo_url || undefined, primary_color: brand?.primary_color }
  );

  return renderTemplate(template.html, context);
}
```

**Step 2: Update sendCampaign function**

Modify the email building part to use the new template-based approach.

**Step 3: Test email sending**

Run local test with `npm run dev` and send a test campaign.

**Step 4: Commit**

```bash
git add workers/newsletter/src/routes/campaign-send.ts
git commit -m "feat(templates): integrate template rendering into campaign send"
```

---

## Phase 6: 管理画面 UI

### Task 6.1: テンプレート設定ページ

**Files:**
- Create: `src/pages/admin/templates/index.astro`
- Create: `src/components/admin/TemplateManager.tsx`
- Modify: `src/utils/admin-api.ts`
- Modify: `src/layouts/AdminLayout.astro`

**Step 1: Add API client functions**

```typescript
// src/utils/admin-api.ts (append)
export interface BrandSettings {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string | null;
}

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  variables: string[];
}

export async function getBrandSettings() {
  return apiRequest<BrandSettings>('/brand-settings');
}

export async function updateBrandSettings(data: Partial<BrandSettings>) {
  return apiRequest<BrandSettings>('/brand-settings', { method: 'PUT', body: data });
}

export async function getPresetTemplates() {
  return apiRequest<PresetTemplate[]>('/templates/presets');
}

export async function previewTemplate(data: { templateId?: string; html?: string; content: string }) {
  return apiRequest<{ html: string }>('/templates/preview', { method: 'POST', body: data });
}
```

**Step 2: Create React component**

Build `TemplateManager.tsx` with:
- Brand settings form (logo URL, colors, footer)
- Preset template list with preview
- Live preview pane

**Step 3: Create Astro page**

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { AuthProvider } from '../../../components/admin/AuthProvider';
import { TemplateManager } from '../../../components/admin/TemplateManager';
---

<AdminLayout title="テンプレート設定">
  <AuthProvider client:load>
    <TemplateManager client:load />
  </AuthProvider>
</AdminLayout>
```

**Step 4: Add navigation link**

Add "テンプレート" link to AdminLayout.astro navigation.

**Step 5: Commit**

```bash
git add src/pages/admin/templates/ src/components/admin/TemplateManager.tsx src/utils/admin-api.ts src/layouts/AdminLayout.astro
git commit -m "feat(templates): add admin UI for template and brand management"
```

---

## Summary

| Phase | Description | Tasks |
|-------|-------------|-------|
| 1 | プリセットテンプレート定義 | 1.1, 1.2 |
| 2 | 変数展開エンジン | 2.1 |
| 3 | DB スキーマ | 3.1 |
| 4 | API エンドポイント | 4.1 |
| 5 | campaign-send.ts 統合 | 5.1 |
| 6 | 管理画面 UI | 6.1 |

**Total Tasks:** 6 major tasks with ~18 subtasks

**Testing Strategy:**
- Unit tests for template types and renderer
- Integration tests for API endpoints
- Manual E2E test for email sending with templates
