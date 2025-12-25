# Batch 4B: 埋め込み機能 設計書

*Created: 2025-12-25*
*Status: 設計完了*

---

## 概要

Signup Pages に埋め込み機能を追加し、外部サイト（WordPress、静的サイト等）にニュースレター登録フォームを埋め込めるようにする。

**スコープ:**
- 4B-1: 埋め込みコード生成（iframe / HTMLフォーム）
- 4B-2: 埋め込みスタイルカスタマイズ（プリセット選択）
- 4B-3: WordPress連携 → **スコープ外**（将来の拡張）

---

## 設計決定事項

| 項目 | 決定内容 |
|------|----------|
| 埋め込み方式 | iframe + HTMLフォーム（JS SDK は将来の拡張） |
| UI配置 | Signup Pages 編集画面に「埋め込みコード」セクション |
| カスタマイズ | プリセット選択（テーマ: light/dark、サイズ: compact/full） |
| ページ構成 | 専用ページ `/newsletter/embed/[slug]` を新規作成 |
| フロー分岐 | 新規作成時に「ランディングページ」or「埋め込み用」を選択 |

---

## ページタイプ

| タイプ | 用途 | 公開URL |
|--------|------|---------|
| `landing` | 独立したランディングページ | `/newsletter/signup/[slug]` |
| `embed` | 外部サイト埋め込み用 | `/newsletter/embed/[slug]` |

---

## DBスキーマ変更

```sql
-- ページタイプ
ALTER TABLE signup_pages ADD COLUMN page_type TEXT DEFAULT 'landing'
  CHECK (page_type IN ('landing', 'embed'));

-- フォーム文言カスタマイズ（landing/embed共通）
ALTER TABLE signup_pages ADD COLUMN email_label TEXT DEFAULT 'メールアドレス';
ALTER TABLE signup_pages ADD COLUMN email_placeholder TEXT DEFAULT 'example@email.com';
ALTER TABLE signup_pages ADD COLUMN name_label TEXT DEFAULT 'お名前';
ALTER TABLE signup_pages ADD COLUMN name_placeholder TEXT DEFAULT '山田 太郎';
ALTER TABLE signup_pages ADD COLUMN success_message TEXT DEFAULT '確認メールを送信しました';

-- 埋め込み専用設定
ALTER TABLE signup_pages ADD COLUMN embed_theme TEXT DEFAULT 'light'
  CHECK (embed_theme IN ('light', 'dark'));
ALTER TABLE signup_pages ADD COLUMN embed_size TEXT DEFAULT 'full'
  CHECK (embed_size IN ('compact', 'full'));
```

---

## 埋め込みページ仕様

**`/newsletter/embed/[slug].astro`**

```
┌─────────────────────────────────┐
│  [メールアドレス入力]           │  ← compact: メールのみ
│  [お名前入力]                   │  ← full: メール+名前
│  [登録ボタン]                   │
│  [ステータスメッセージ]         │  ← 成功/エラー表示
└─────────────────────────────────┘
```

**特徴:**
- ヘッダー/フッター/ナビなし（フォームのみ）
- Turnstile は埋め込みでも必須（スパム対策）
- 送信後はページ遷移せず、その場でメッセージ表示
- クエリパラメータでスタイル制御: `?theme=dark&size=compact`

**テーマ対応:**

| theme | 背景 | テキスト | ボタン |
|-------|------|----------|--------|
| light | 白 | 黒 | グレー |
| dark | 暗めグレー | 白 | ライトグレー |

**サイズ対応:**

| size | 表示項目 |
|------|----------|
| compact | メールアドレスのみ |
| full | メールアドレス + 名前 |

---

## カスタマイズ可能な項目

| 項目 | デフォルト値 | 備考 |
|------|-------------|------|
| email_label | `メールアドレス` | |
| email_placeholder | `example@email.com` | |
| name_label | `お名前` | size=full の時のみ表示 |
| name_placeholder | `山田 太郎` | |
| button_text | `登録する` | 既存カラム |
| success_message | `確認メールを送信しました` | |

---

## 埋め込みコード生成UI

**配置:** embed タイプのページ編集画面に「埋め込みコード」セクション

**UI構成:**
```
┌─────────────────────────────────────────────┐
│ 埋め込みコード                              │
├─────────────────────────────────────────────┤
│ 形式: [iframe ▼] [HTMLフォーム ▼]           │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ <iframe                                 │ │
│ │   src="https://edgeshift.tech/..."      │ │
│ │   width="100%" height="300"             │ │
│ │   frameborder="0">                      │ │
│ │ </iframe>                               │ │
│ └─────────────────────────────────────────┘ │
│                           [コピー] ボタン   │
└─────────────────────────────────────────────┘
```

**生成されるコード例:**

### iframe
```html
<iframe
  src="https://edgeshift.tech/newsletter/embed/tech-updates?theme=light&size=full"
  width="100%"
  height="350"
  frameborder="0">
</iframe>
```

### HTMLフォーム
```html
<form id="es-signup-xxx" style="...">
  <input type="email" placeholder="example@email.com" required>
  <button type="submit">登録する</button>
</form>
<script>/* fetch送信ロジック */</script>
```

---

## ファイル構成

```
【新規作成】
src/pages/newsletter/embed/[slug].astro      # 埋め込み専用ページ
src/components/admin/EmbedCodeGenerator.tsx  # コード生成UI

【修正】
workers/newsletter/schema.sql                # スキーマ更新
workers/newsletter/src/routes/signup-pages.ts # API で新カラム対応
workers/newsletter/src/types.ts              # 型定義更新
src/pages/newsletter/signup/[slug].astro     # 新カラム反映
src/components/admin/SignupPageEditForm.tsx  # page_type 分岐 + embed設定
src/pages/admin/signup-pages/new.astro       # ページタイプ選択UI
src/utils/admin-api.ts                       # API クライアント更新
```

---

## 実装タスク

| # | タスク | 内容 |
|---|--------|------|
| 1 | DBスキーマ更新 | `page_type`, フォーム文言カラム, `embed_theme/size` 追加 |
| 2 | API更新 | signup-pages CRUD で新カラム対応 |
| 3 | 埋め込みページ作成 | `/newsletter/embed/[slug].astro` 新規作成 |
| 4 | ランディングページ更新 | `/newsletter/signup/[slug].astro` で新カラム反映 |
| 5 | 編集フォーム分岐 | page_type で landing/embed のUI切り替え |
| 6 | 埋め込みコード生成UI | EmbedCodeGenerator コンポーネント作成 |
| 7 | 新規作成フロー | ページタイプ選択 → 適切な編集画面へ |
| 8 | テスト | API テスト追加、動作確認 |

**工数見積もり:** 約4時間

---

## 今後の拡張（スコープ外）

- JS SDK 方式（動的高さ調整、親サイトCSS継承）
- WordPress プラグイン（API同期）
- 詳細スタイルカスタマイズ（色、フォント、ボーダー個別設定）

---

## 参考

- 既存実装: Batch 4A（Signup Pages CRUD、RichTextEditor）
- 関連ドキュメント: `documents/portfolio_site/newsletter_system/newsletter_system_mvp.md`
