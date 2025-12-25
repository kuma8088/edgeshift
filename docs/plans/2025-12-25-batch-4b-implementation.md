# Batch 4B: 埋め込み機能 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 外部サイトに埋め込める登録フォーム機能を実装し、Signup Pages に page_type 分岐を追加する

**Architecture:** signup_pages テーブルを拡張し、page_type (landing/embed) で分岐。embed 用の専用ページ `/newsletter/embed/[slug]` を作成し、iframe / HTMLフォームコードを生成する。

**Tech Stack:** Astro, React, Cloudflare Workers, D1 (SQLite), TypeScript

---

## Task 1: DBスキーマ拡張

**Files:**
- Modify: `workers/newsletter/schema.sql`

**Step 1: スキーマファイルに新カラムを追加**

`workers/newsletter/schema.sql` の signup_pages テーブル定義を以下に更新：

```sql
-- Signup Page Generation (Batch 4A + 4B)
CREATE TABLE IF NOT EXISTS signup_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  sequence_id TEXT,

  -- Page type (Batch 4B)
  page_type TEXT DEFAULT 'landing' CHECK (page_type IN ('landing', 'embed')),

  -- Form customization (shared between landing/embed)
  button_text TEXT DEFAULT '登録する',
  form_fields TEXT DEFAULT 'email,name',
  email_label TEXT DEFAULT 'メールアドレス',
  email_placeholder TEXT DEFAULT 'example@email.com',
  name_label TEXT DEFAULT 'お名前',
  name_placeholder TEXT DEFAULT '山田 太郎',
  success_message TEXT DEFAULT '確認メールを送信しました',

  -- Landing page only
  pending_title TEXT DEFAULT '確認メールを送信しました',
  pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。',
  confirmed_title TEXT DEFAULT '登録が完了しました',
  confirmed_message TEXT DEFAULT 'ニュースレターへのご登録ありがとうございます。',

  -- Embed page only
  embed_theme TEXT DEFAULT 'light' CHECK (embed_theme IN ('light', 'dark')),
  embed_size TEXT DEFAULT 'full' CHECK (embed_size IN ('compact', 'full')),

  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL
);
```

**Step 2: ALTER TABLEで既存DBに適用**

ローカル/本番DBには ALTER TABLE で追加。migration スクリプトを作成：

ファイル: `workers/newsletter/migrations/004_add_embed_columns.sql`

```sql
-- Add page_type column
ALTER TABLE signup_pages ADD COLUMN page_type TEXT DEFAULT 'landing';

-- Add form customization columns
ALTER TABLE signup_pages ADD COLUMN button_text TEXT DEFAULT '登録する';
ALTER TABLE signup_pages ADD COLUMN form_fields TEXT DEFAULT 'email,name';
ALTER TABLE signup_pages ADD COLUMN email_label TEXT DEFAULT 'メールアドレス';
ALTER TABLE signup_pages ADD COLUMN email_placeholder TEXT DEFAULT 'example@email.com';
ALTER TABLE signup_pages ADD COLUMN name_label TEXT DEFAULT 'お名前';
ALTER TABLE signup_pages ADD COLUMN name_placeholder TEXT DEFAULT '山田 太郎';
ALTER TABLE signup_pages ADD COLUMN success_message TEXT DEFAULT '確認メールを送信しました';

-- Add landing page columns
ALTER TABLE signup_pages ADD COLUMN pending_title TEXT DEFAULT '確認メールを送信しました';
ALTER TABLE signup_pages ADD COLUMN pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。';
ALTER TABLE signup_pages ADD COLUMN confirmed_title TEXT DEFAULT '登録が完了しました';
ALTER TABLE signup_pages ADD COLUMN confirmed_message TEXT DEFAULT 'ニュースレターへのご登録ありがとうございます。';

-- Add embed page columns
ALTER TABLE signup_pages ADD COLUMN embed_theme TEXT DEFAULT 'light';
ALTER TABLE signup_pages ADD COLUMN embed_size TEXT DEFAULT 'full';
```

**Step 3: ローカルDBにマイグレーション適用**

```bash
cd workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --local --file=migrations/004_add_embed_columns.sql
```

**Step 4: コミット**

```bash
git add workers/newsletter/schema.sql workers/newsletter/migrations/004_add_embed_columns.sql
git commit -m "feat(db): add embed columns to signup_pages table"
```

---

## Task 2: 型定義の更新

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: SignupPage インターフェースを更新**

```typescript
// Signup Page (Batch 4A + 4B)
export type PageType = 'landing' | 'embed';
export type EmbedTheme = 'light' | 'dark';
export type EmbedSize = 'compact' | 'full';

export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  title: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;

  // Page type (Batch 4B)
  page_type: PageType;

  // Form customization (shared)
  button_text: string;
  form_fields: string;
  email_label: string;
  email_placeholder: string;
  name_label: string;
  name_placeholder: string;
  success_message: string;

  // Landing page only
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;

  // Embed page only
  embed_theme: EmbedTheme;
  embed_size: EmbedSize;

  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSignupPageRequest {
  slug: string;
  sequence_id?: string;
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: EmbedTheme;
  embed_size?: EmbedSize;
}

export interface UpdateSignupPageRequest {
  slug?: string;
  sequence_id?: string;
  title?: string;
  content?: string;
  meta_title?: string;
  meta_description?: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: EmbedTheme;
  embed_size?: EmbedSize;
}
```

**Step 2: コミット**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add embed-related types to SignupPage"
```

---

## Task 3: API の更新

**Files:**
- Modify: `workers/newsletter/src/routes/signup-pages.ts`
- Test: `workers/newsletter/src/__tests__/signup-pages.test.ts`

**Step 1: SignupPageInput インターフェースを更新**

```typescript
interface SignupPageInput {
  slug: string;
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  sequence_id?: string;
  page_type?: 'landing' | 'embed';
  button_text?: string;
  form_fields?: string;
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: 'light' | 'dark';
  embed_size?: 'compact' | 'full';
}
```

**Step 2: createSignupPage 関数を更新**

INSERT文を拡張して新カラムを含める：

```typescript
export async function createSignupPage(env: Env, input: SignupPageInput): Promise<SignupPage> {
  // ... existing validation ...

  await env.DB.prepare(
    `INSERT INTO signup_pages (
      id, slug, title, content, meta_title, meta_description, sequence_id,
      page_type, button_text, form_fields,
      email_label, email_placeholder, name_label, name_placeholder,
      success_message, pending_title, pending_message,
      confirmed_title, confirmed_message, embed_theme, embed_size,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      id,
      input.slug,
      input.title,
      input.content,
      input.meta_title || null,
      input.meta_description || null,
      input.sequence_id || null,
      input.page_type || 'landing',
      input.button_text || '登録する',
      input.form_fields || 'email,name',
      input.email_label || 'メールアドレス',
      input.email_placeholder || 'example@email.com',
      input.name_label || 'お名前',
      input.name_placeholder || '山田 太郎',
      input.success_message || '確認メールを送信しました',
      input.pending_title || '確認メールを送信しました',
      input.pending_message || 'メール内のリンクをクリックして登録を完了してください。',
      input.confirmed_title || '登録が完了しました',
      input.confirmed_message || 'ニュースレターへのご登録ありがとうございます。',
      input.embed_theme || 'light',
      input.embed_size || 'full',
      now,
      now
    )
    .run();

  // ...
}
```

**Step 3: updateSignupPage 関数を更新**

新カラムの更新を追加：

```typescript
// Add to the updates building section:
if (input.page_type !== undefined) {
  updates.push('page_type = ?');
  bindings.push(input.page_type);
}
if (input.button_text !== undefined) {
  updates.push('button_text = ?');
  bindings.push(input.button_text);
}
if (input.form_fields !== undefined) {
  updates.push('form_fields = ?');
  bindings.push(input.form_fields);
}
if (input.email_label !== undefined) {
  updates.push('email_label = ?');
  bindings.push(input.email_label);
}
if (input.email_placeholder !== undefined) {
  updates.push('email_placeholder = ?');
  bindings.push(input.email_placeholder);
}
if (input.name_label !== undefined) {
  updates.push('name_label = ?');
  bindings.push(input.name_label);
}
if (input.name_placeholder !== undefined) {
  updates.push('name_placeholder = ?');
  bindings.push(input.name_placeholder);
}
if (input.success_message !== undefined) {
  updates.push('success_message = ?');
  bindings.push(input.success_message);
}
if (input.pending_title !== undefined) {
  updates.push('pending_title = ?');
  bindings.push(input.pending_title);
}
if (input.pending_message !== undefined) {
  updates.push('pending_message = ?');
  bindings.push(input.pending_message);
}
if (input.confirmed_title !== undefined) {
  updates.push('confirmed_title = ?');
  bindings.push(input.confirmed_title);
}
if (input.confirmed_message !== undefined) {
  updates.push('confirmed_message = ?');
  bindings.push(input.confirmed_message);
}
if (input.embed_theme !== undefined) {
  updates.push('embed_theme = ?');
  bindings.push(input.embed_theme);
}
if (input.embed_size !== undefined) {
  updates.push('embed_size = ?');
  bindings.push(input.embed_size);
}
```

**Step 4: テストを追加**

`signup-pages.test.ts` に新カラムのテストを追加：

```typescript
describe('embed page support', () => {
  it('should create embed page with theme and size', async () => {
    const page = await createSignupPage(env, {
      slug: 'embed-form',
      title: 'Embed Form',
      content: '<p>Subscribe</p>',
      page_type: 'embed',
      embed_theme: 'dark',
      embed_size: 'compact',
    });

    expect(page.page_type).toBe('embed');
    expect(page.embed_theme).toBe('dark');
    expect(page.embed_size).toBe('compact');
  });

  it('should default to landing page type', async () => {
    const page = await createSignupPage(env, {
      slug: 'default-type',
      title: 'Default',
      content: '<p>Content</p>',
    });

    expect(page.page_type).toBe('landing');
    expect(page.embed_theme).toBe('light');
    expect(page.embed_size).toBe('full');
  });
});
```

**Step 5: テスト実行**

```bash
cd workers/newsletter
npm test
```

Expected: All tests pass

**Step 6: コミット**

```bash
git add workers/newsletter/src/routes/signup-pages.ts workers/newsletter/src/__tests__/signup-pages.test.ts
git commit -m "feat(api): support embed columns in signup-pages CRUD"
```

---

## Task 4: 埋め込み専用ページの作成

**Files:**
- Create: `src/pages/newsletter/embed/[slug].astro`

**Step 1: 埋め込みページを作成**

```astro
---
// /newsletter/embed/[slug].astro - Embed-only signup form
const { slug } = Astro.params;

// Get query params for styling
const url = new URL(Astro.request.url);
const theme = url.searchParams.get('theme') || 'light';
const size = url.searchParams.get('size') || 'full';

// Fetch page config
const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';
const response = await fetch(`${apiUrl}/api/signup-pages/by-slug/${slug}`);

if (!response.ok) {
  return new Response('Not Found', { status: 404 });
}

const { data } = await response.json();
const page = data.page;

// Only allow embed pages
if (page.page_type !== 'embed') {
  return Astro.redirect(`/newsletter/signup/${slug}`);
}

const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || '';

// Theme styles
const themes = {
  light: {
    bg: 'bg-white',
    text: 'text-gray-900',
    input: 'bg-white border-gray-300 text-gray-900',
    button: 'bg-gray-800 text-white hover:bg-gray-700',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  },
  dark: {
    bg: 'bg-gray-800',
    text: 'text-white',
    input: 'bg-gray-700 border-gray-600 text-white placeholder-gray-400',
    button: 'bg-white text-gray-800 hover:bg-gray-100',
    success: 'bg-green-900 text-green-200 border-green-700',
    error: 'bg-red-900 text-red-200 border-red-700',
  },
};

const currentTheme = themes[theme as keyof typeof themes] || themes.light;
const showName = size === 'full' && page.form_fields.includes('name');
---

<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{page.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body class={`${currentTheme.bg} p-4`}>
  <form id="embed-form" class="space-y-3">
    <!-- Email -->
    <div>
      <label class={`block text-sm font-medium ${currentTheme.text} mb-1`}>
        {page.email_label}
      </label>
      <input
        type="email"
        id="email"
        name="email"
        required
        placeholder={page.email_placeholder}
        class={`w-full px-3 py-2 rounded border ${currentTheme.input} focus:outline-none focus:ring-2 focus:ring-blue-500`}
      />
    </div>

    <!-- Name (if full size and enabled) -->
    {showName && (
      <div>
        <label class={`block text-sm font-medium ${currentTheme.text} mb-1`}>
          {page.name_label}
        </label>
        <input
          type="text"
          id="name"
          name="name"
          placeholder={page.name_placeholder}
          class={`w-full px-3 py-2 rounded border ${currentTheme.input} focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
      </div>
    )}

    <!-- Turnstile -->
    <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme={theme}></div>

    <!-- Submit -->
    <button
      type="submit"
      id="submit-btn"
      class={`w-full px-4 py-2 rounded font-medium ${currentTheme.button} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
    >
      <span id="btn-text">{page.button_text}</span>
      <svg id="btn-spinner" class="hidden animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </button>

    <!-- Status -->
    <div id="status" class="hidden">
      <div id="success" class={`hidden p-3 rounded border text-sm ${currentTheme.success}`}></div>
      <div id="error" class={`hidden p-3 rounded border text-sm ${currentTheme.error}`}></div>
    </div>
  </form>

  <script define:vars={{ sequenceId: page.sequence_id, successMessage: page.success_message }}>
    const form = document.getElementById('embed-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const status = document.getElementById('status');
    const success = document.getElementById('success');
    const error = document.getElementById('error');

    function setLoading(loading) {
      submitBtn.disabled = loading;
      btnSpinner.classList.toggle('hidden', !loading);
    }

    function showMessage(type, message) {
      status.classList.remove('hidden');
      success.classList.toggle('hidden', type !== 'success');
      error.classList.toggle('hidden', type !== 'error');
      (type === 'success' ? success : error).textContent = message;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.classList.add('hidden');

      const turnstileInput = form.querySelector('input[name="cf-turnstile-response"]');
      const turnstileToken = turnstileInput?.value;

      if (!turnstileToken) {
        showMessage('error', 'セキュリティ検証を完了してください');
        return;
      }

      setLoading(true);

      const formData = new FormData(form);
      const data = {
        email: formData.get('email'),
        name: formData.get('name') || undefined,
        turnstileToken,
        sequenceId: sequenceId || undefined,
      };

      try {
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.success) {
          form.reset();
          showMessage('success', successMessage);
          // Reset Turnstile
          if (window.turnstile) {
            window.turnstile.reset();
          }
        } else {
          showMessage('error', result.error || '登録に失敗しました');
        }
      } catch (err) {
        console.error('Signup error:', err);
        showMessage('error', '通信エラーが発生しました');
      } finally {
        setLoading(false);
      }
    });
  </script>
</body>
</html>
```

**Step 2: 動作確認**

```bash
npm run dev
# ブラウザで /newsletter/embed/test-slug?theme=light&size=full を確認
```

**Step 3: コミット**

```bash
git add src/pages/newsletter/embed/\[slug\].astro
git commit -m "feat(frontend): add embed-only signup page"
```

---

## Task 5: ランディングページの更新

**Files:**
- Modify: `src/pages/newsletter/signup/[slug].astro`

**Step 1: 新カラムを反映**

フォームのラベル・プレースホルダーを動的に：

```astro
<!-- Email field を更新 -->
<label for="email" class="block text-sm font-medium text-gray-700 mb-1.5">
  {page.email_label} <span class="text-red-500">*</span>
</label>
<input
  type="email"
  id="email"
  name="email"
  required
  class="w-full px-4 py-3 rounded border border-gray-300 focus:outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800"
  placeholder={page.email_placeholder}
/>

<!-- Name field を更新 -->
{page.form_fields.includes('name') && (
  <div>
    <label for="name" class="block text-sm font-medium text-gray-700 mb-1.5">
      {page.name_label} <span class="text-gray-500 text-xs">(任意)</span>
    </label>
    <input
      type="text"
      id="name"
      name="name"
      class="w-full px-4 py-3 rounded border border-gray-300 focus:outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800"
      placeholder={page.name_placeholder}
    />
  </div>
)}
```

**Step 2: embed ページへのリダイレクト追加**

```astro
// page_type が embed の場合は embed ページへリダイレクト
if (page.page_type === 'embed') {
  return Astro.redirect(`/newsletter/embed/${slug}`);
}
```

**Step 3: コミット**

```bash
git add src/pages/newsletter/signup/\[slug\].astro
git commit -m "feat(frontend): use dynamic form labels in landing page"
```

---

## Task 6: 編集フォームの page_type 分岐

**Files:**
- Modify: `src/components/admin/SignupPageEditForm.tsx`

**Step 1: page_type 状態を追加**

```typescript
const [pageType, setPageType] = useState<'landing' | 'embed'>('landing');
const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('light');
const [embedSize, setEmbedSize] = useState<'compact' | 'full'>('full');
const [emailLabel, setEmailLabel] = useState('メールアドレス');
const [emailPlaceholder, setEmailPlaceholder] = useState('example@email.com');
const [nameLabel, setNameLabel] = useState('お名前');
const [namePlaceholder, setNamePlaceholder] = useState('山田 太郎');
const [successMessage, setSuccessMessage] = useState('確認メールを送信しました');
```

**Step 2: loadPage で新カラムを読み込み**

```typescript
setPageType(data.page_type || 'landing');
setEmbedTheme(data.embed_theme || 'light');
setEmbedSize(data.embed_size || 'full');
setEmailLabel(data.email_label || 'メールアドレス');
setEmailPlaceholder(data.email_placeholder || 'example@email.com');
setNameLabel(data.name_label || 'お名前');
setNamePlaceholder(data.name_placeholder || '山田 太郎');
setSuccessMessage(data.success_message || '確認メールを送信しました');
```

**Step 3: handleSubmit で新カラムを送信**

```typescript
const pageData = {
  slug,
  sequence_id: sequenceId || undefined,
  title,
  content,
  page_type: pageType,
  button_text: buttonText,
  form_fields: formFields,
  email_label: emailLabel,
  email_placeholder: emailPlaceholder,
  name_label: nameLabel,
  name_placeholder: namePlaceholder,
  success_message: successMessage,
  pending_title: pendingTitle,
  pending_message: pendingMessage,
  confirmed_title: confirmedTitle,
  confirmed_message: confirmedMessage,
  embed_theme: embedTheme,
  embed_size: embedSize,
};
```

**Step 4: UI を page_type で分岐**

基本設定セクションに「ページタイプ」を追加：

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    ページタイプ
  </label>
  <div className="flex gap-4">
    <label className="flex items-center">
      <input
        type="radio"
        name="pageType"
        value="landing"
        checked={pageType === 'landing'}
        onChange={() => setPageType('landing')}
        className="mr-2"
      />
      ランディングページ
    </label>
    <label className="flex items-center">
      <input
        type="radio"
        name="pageType"
        value="embed"
        checked={pageType === 'embed'}
        onChange={() => setPageType('embed')}
        className="mr-2"
      />
      埋め込み用
    </label>
  </div>
</div>
```

landing/embed で表示セクションを分岐：

```tsx
{/* Landing page only sections */}
{pageType === 'landing' && (
  <>
    {/* Pending Page Settings */}
    {/* Confirmed Page Settings */}
  </>
)}

{/* Embed page only sections */}
{pageType === 'embed' && (
  <>
    {/* Embed Settings */}
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        埋め込み設定
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            テーマ
          </label>
          <select
            value={embedTheme}
            onChange={(e) => setEmbedTheme(e.target.value as 'light' | 'dark')}
            className="w-full px-4 py-2 border border-gray-300 rounded"
          >
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            サイズ
          </label>
          <select
            value={embedSize}
            onChange={(e) => setEmbedSize(e.target.value as 'compact' | 'full')}
            className="w-full px-4 py-2 border border-gray-300 rounded"
          >
            <option value="full">フル（メール+名前）</option>
            <option value="compact">コンパクト（メールのみ）</option>
          </select>
        </div>
      </div>
    </div>

    {/* Embed Code Generator */}
    <EmbedCodeGenerator
      slug={slug}
      theme={embedTheme}
      size={embedSize}
    />
  </>
)}
```

**Step 5: コミット**

```bash
git add src/components/admin/SignupPageEditForm.tsx
git commit -m "feat(admin): add page_type selection and embed settings"
```

---

## Task 7: 埋め込みコード生成コンポーネント

**Files:**
- Create: `src/components/admin/EmbedCodeGenerator.tsx`

**Step 1: コンポーネントを作成**

```tsx
'use client';

import { useState } from 'react';

interface EmbedCodeGeneratorProps {
  slug: string;
  theme: 'light' | 'dark';
  size: 'compact' | 'full';
}

export function EmbedCodeGenerator({ slug, theme, size }: EmbedCodeGeneratorProps) {
  const [format, setFormat] = useState<'iframe' | 'html'>('iframe');
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://edgeshift.tech';

  const embedUrl = `${baseUrl}/newsletter/embed/${slug}?theme=${theme}&size=${size}`;

  const iframeCode = `<iframe
  src="${embedUrl}"
  width="100%"
  height="${size === 'compact' ? '200' : '280'}"
  frameborder="0"
  style="border: none; max-width: 400px;">
</iframe>`;

  const htmlCode = `<form id="es-signup-${slug}" action="${baseUrl}/api/newsletter/subscribe" method="POST" style="max-width: 400px;">
  <div style="margin-bottom: 12px;">
    <input type="email" name="email" placeholder="example@email.com" required
      style="width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;">
  </div>
  <button type="submit" style="width: 100%; padding: 8px 16px; background: #1f2937; color: white; border: none; border-radius: 4px; cursor: pointer;">
    登録する
  </button>
</form>
<script>
document.getElementById('es-signup-${slug}').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  try {
    const res = await fetch('${baseUrl}/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, turnstileToken: 'embed' })
    });
    const data = await res.json();
    alert(data.success ? '確認メールを送信しました' : data.error);
  } catch (err) {
    alert('エラーが発生しました');
  }
});
</script>`;

  const code = format === 'iframe' ? iframeCode : htmlCode;

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        埋め込みコード
      </h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          形式
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="format"
              value="iframe"
              checked={format === 'iframe'}
              onChange={() => setFormat('iframe')}
              className="mr-2"
            />
            iframe（推奨）
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="format"
              value="html"
              checked={format === 'html'}
              onChange={() => setFormat('html')}
              className="mr-2"
            />
            HTMLフォーム
          </label>
        </div>
      </div>

      <div className="relative">
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto whitespace-pre-wrap break-all">
          {code}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-3 py-1 bg-gray-800 text-white text-sm rounded hover:bg-gray-700"
        >
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>

      {format === 'html' && (
        <p className="mt-2 text-sm text-amber-600">
          注意: HTMLフォームにはTurnstile検証が含まれていないため、本番環境ではスパム対策が必要です。
        </p>
      )}
    </div>
  );
}
```

**Step 2: SignupPageEditForm に import を追加**

```typescript
import { EmbedCodeGenerator } from './EmbedCodeGenerator';
```

**Step 3: コミット**

```bash
git add src/components/admin/EmbedCodeGenerator.tsx
git commit -m "feat(admin): add EmbedCodeGenerator component"
```

---

## Task 8: 新規作成フローの更新

**Files:**
- Modify: `src/pages/admin/signup-pages/new.astro`

**Step 1: ページタイプ選択UIを追加**

新規作成ページにページタイプの初期選択を追加。SignupPageEditForm はそのまま使用し、クエリパラメータで初期タイプを渡す：

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { SignupPageEditForm } from '../../../components/admin/SignupPageEditForm';

const url = new URL(Astro.request.url);
const initialType = url.searchParams.get('type') || 'landing';
---

<AdminLayout title="新しいページを作成">
  <SignupPageEditForm client:load initialPageType={initialType} />
</AdminLayout>
```

**Step 2: SignupPageEditForm に initialPageType prop を追加**

```typescript
interface SignupPageEditFormProps {
  pageId?: string;
  initialPageType?: 'landing' | 'embed';
}

export function SignupPageEditForm({ pageId, initialPageType = 'landing' }: SignupPageEditFormProps) {
  const [pageType, setPageType] = useState<'landing' | 'embed'>(initialPageType);
  // ...
}
```

**Step 3: 一覧ページに作成ボタンを2つ追加（オプション）**

```astro
<div className="flex gap-2">
  <a href="/admin/signup-pages/new?type=landing" className="...">
    ランディングページを作成
  </a>
  <a href="/admin/signup-pages/new?type=embed" className="...">
    埋め込みフォームを作成
  </a>
</div>
```

**Step 4: コミット**

```bash
git add src/pages/admin/signup-pages/new.astro src/components/admin/SignupPageEditForm.tsx
git commit -m "feat(admin): add page type selection in new page flow"
```

---

## Task 9: API クライアント更新

**Files:**
- Modify: `src/utils/admin-api.ts`

**Step 1: 型定義を更新**

```typescript
export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  title: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  page_type: 'landing' | 'embed';
  button_text: string;
  form_fields: string;
  email_label: string;
  email_placeholder: string;
  name_label: string;
  name_placeholder: string;
  success_message: string;
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;
  embed_theme: 'light' | 'dark';
  embed_size: 'compact' | 'full';
  is_active: number;
  created_at: number;
  updated_at: number;
}
```

**Step 2: コミット**

```bash
git add src/utils/admin-api.ts
git commit -m "feat(frontend): update SignupPage type in admin-api"
```

---

## Task 10: テスト実行と本番デプロイ

**Step 1: 全テスト実行**

```bash
cd workers/newsletter
npm test
```

Expected: All tests pass

**Step 2: ビルド確認**

```bash
cd ../..
npm run build
npm run check
```

Expected: No errors

**Step 3: 本番DBにマイグレーション適用**

```bash
cd workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --remote --file=migrations/004_add_embed_columns.sql
```

**Step 4: Worker デプロイ**

```bash
npm run deploy
```

**Step 5: Pages デプロイ**

```bash
cd ../..
npm run build
npx wrangler pages deploy dist --project-name edgeshift
```

**Step 6: 最終コミット**

```bash
git add -A
git commit -m "feat: complete Batch 4B embed functionality"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | schema.sql, migrations/ | DBスキーマ拡張 |
| 2 | types.ts | 型定義更新 |
| 3 | signup-pages.ts, test | API 更新 |
| 4 | embed/[slug].astro | 埋め込みページ作成 |
| 5 | signup/[slug].astro | ランディングページ更新 |
| 6 | SignupPageEditForm.tsx | page_type 分岐 |
| 7 | EmbedCodeGenerator.tsx | コード生成UI |
| 8 | new.astro | 新規作成フロー |
| 9 | admin-api.ts | API クライアント |
| 10 | - | テスト・デプロイ |

**Total commits:** 10
**Estimated time:** 3-4 hours
