# Newsletter Archive Design

**Date:** 2025-12-29
**Feature:** Newsletter Archive (Web公開)
**Priority:** 1 (MVP追加機能)
**Estimated Effort:** 3 days

---

## Overview

Beehiiv/Substackのような公開アーカイブ機能を実装。SEOでオーガニック流入を獲得し、新規購読者獲得の入口とする。

---

## Requirements

### Functional Requirements

1. `/newsletter/archive` でバックナンバー一覧表示
2. 個別記事ページ (`/newsletter/archive/[slug]`) の表示
3. OGPメタタグ対応（SNSシェア最適化）
4. RSS 2.0フィード生成 (`/newsletter/feed.xml`)
5. Admin画面から記事の公開/非公開切り替え

### Non-Functional Requirements

- SEO対応（適切なメタタグ、構造化データ）
- ページネーション（ページ番号式）
- レスポンシブデザイン
- Cloudflare Workers + D1でエッジ配信

### Out of Scope (MVP)

- 購読者限定記事の認証機能（Phase 5-6で実装予定）
- サムネイル画像
- カテゴリ/タグ機能
- 検索機能

---

## Design Decisions

### 1. Public/Private Toggle
**Decision:** キャンペーン作成時に公開/非公開を設定、デフォルトは非公開

**Rationale:**
- 送信前に公開設定を決めることで、意図しない公開を防げる
- Admin画面で後から変更も可能
- 安全第一

### 2. Subscriber-Only Content
**Decision:** MVPでは全公開のみ、購読者限定機能は後回し

**Rationale:**
- MVP第一弾として基本機能を完成させる
- 認証機能は別Phase（5-6）で実装する方が設計しやすい
- データベースには将来拡張用のフラグを用意

### 3. URL Slug Generation
**Decision:** 自動生成をデフォルトとし、Admin画面で編集可能

**Rationale:**
- 初期設定が楽（自動生成）
- SEOを意識したい場合は手動で調整可能
- 日本語タイトル→slug変換を実装

### 4. Feed Format
**Decision:** RSS 2.0のみ提供

**Rationale:**
- 最も広く使われている
- Atomは技術的に優れているが、実用上RSS 2.0で十分
- 実装コストを抑える（MVPとして）

### 5. Pagination
**Decision:** ページ番号式（1, 2, 3... のリンク）

**Rationale:**
- SEO最適化（各ページが独立したURL）
- ブックマーク可能
- Astro（SSR）と相性が良い
- 実装がシンプル

### 6. Archive List Display
**Decision:** タイトル + 公開日 + 要約（最初の200文字）

**Rationale:**
- 記事の内容がわかりやすい
- SEOに有利
- サムネイル画像は現状のschemaに含まれていないため省略

### 7. Rendering Strategy
**Decision:** Astro SSR（サーバーサイドレンダリング）

**Rationale:**
- リアルタイム更新（再ビルド不要）
- Admin画面での公開/非公開がすぐ反映
- Cloudflare Workers + D1は十分高速
- ニュースレターは頻繁に新記事を公開するため、リアルタイム性が重要

---

## Database Design

### Schema Changes

```sql
-- campaigns テーブルへの追加カラム
ALTER TABLE campaigns ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE campaigns ADD COLUMN is_published INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN published_at INTEGER;
ALTER TABLE campaigns ADD COLUMN excerpt TEXT;

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_slug ON campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_campaigns_published ON campaigns(is_published, published_at);
```

### Column Specifications

| Column | Type | Description |
|--------|------|-------------|
| `slug` | TEXT | URL用の一意識別子（例: "2024-01-newsletter"） |
| `is_published` | INTEGER | 0=非公開, 1=公開 |
| `published_at` | INTEGER | 公開日時（unixタイムスタンプ） |
| `excerpt` | TEXT | 要約文（最初の200文字を自動生成またはカスタム入力可） |

### Slug Generation Logic

- 日本語タイトル → ローマ字変換 + 日付プレフィックス
- 例: "2024年1月のニュース" → "2024-01-no-news"
- 重複時は末尾に数字を追加（-2, -3...）
- 最大長: 100文字

---

## API Design

### New Endpoints

#### GET /api/archive

公開アーカイブ一覧取得（認証不要）

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 10)

**Response:**
```typescript
{
  articles: [
    {
      id: string;
      slug: string;
      subject: string;
      excerpt: string;
      published_at: number;
      is_subscriber_only: boolean; // 将来用（現在は常にfalse）
    }
  ],
  pagination: {
    page: number;
    total_pages: number;
    total_count: number;
  }
}
```

#### GET /api/archive/:slug

個別記事取得（認証不要、公開済みのみ）

**Response:**
```typescript
{
  id: string;
  slug: string;
  subject: string;
  content: string;
  published_at: number;
}
```

**Error Cases:**
- 404: slug不一致 or 未公開記事

#### GET /api/archive/feed.xml

RSS 2.0 フィード生成（認証不要）

**Response:** RSS 2.0 XML（最新20件）

### Extended Endpoints

#### POST /api/campaigns
#### PUT /api/campaigns/:id

既存APIにフィールド追加:

**Request:**
```typescript
{
  subject: string;
  content: string;
  slug?: string;        // 未指定なら自動生成
  is_published?: boolean; // デフォルト false
  excerpt?: string;     // 未指定ならcontentの最初の200文字
  // ... 既存フィールド
}
```

---

## Frontend Design

### Page Structure

```
src/pages/newsletter/
├── archive/
│   ├── index.astro          # 一覧ページ（SSR）
│   └── [slug].astro         # 個別記事ページ（SSR）
└── feed.xml.ts              # RSS feed生成
```

### archive/index.astro

**Purpose:** 公開記事の一覧表示とページネーション

**Implementation:**
- `Astro.url.searchParams.get('page')` でページ番号取得
- Workers経由で `/api/archive?page=X` を呼び出し
- 各記事: タイトル + 公開日 + 要約 + 「続きを読む」リンク
- ページネーションコンポーネント表示

**Layout:** 既存の Newsletter レイアウトを再利用

### archive/[slug].astro

**Purpose:** 個別記事の表示

**Implementation:**
- `Astro.params.slug` で記事取得
- Workers経由で `/api/archive/:slug` を呼び出し
- 404時は NotFound ページ表示
- OGPメタタグ設定

**OGP Meta Tags:**
```astro
<head>
  <title>{article.subject} | EdgeShift Newsletter</title>
  <meta name="description" content={article.excerpt} />
  <meta property="og:title" content={article.subject} />
  <meta property="og:description" content={article.excerpt} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={canonicalUrl} />
  <meta name="twitter:card" content="summary_large_image" />
</head>
```

### feed.xml.ts

**Purpose:** RSS 2.0 フィード生成

**Implementation:**
```typescript
export async function GET() {
  const articles = await fetch('/api/archive?limit=20');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>EdgeShift Newsletter</title>
    <link>https://edgeshift.tech/newsletter/archive</link>
    <description>EdgeShift ニュースレター</description>
    ${articles.map(a => `
      <item>
        <title>${escape(a.subject)}</title>
        <link>https://edgeshift.tech/newsletter/archive/${a.slug}</link>
        <description>${escape(a.excerpt)}</description>
        <pubDate>${formatRFC822(a.published_at)}</pubDate>
        <guid>https://edgeshift.tech/newsletter/archive/${a.slug}</guid>
      </item>
    `).join('')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: { 'Content-Type': 'application/xml' }
  });
}
```

---

## Error Handling

### 404 Errors

1. **slug不一致** → 404ページ表示
2. **未公開記事へのアクセス** → 404（存在を隠す）

### Validation

1. **slug重複チェック**
   - Admin画面でslug編集時にバリデーション
   - APIレベルでUNIQUE制約により重複防止

2. **日本語→slug変換時の文字制限**
   - 最大100文字
   - 特殊文字の除去

### Fallbacks

1. **API呼び出し失敗** → エラーページ表示
2. **RSS生成失敗** → 空のフィード返却（エラーログ記録）

---

## Testing Strategy

### Unit Tests

```typescript
// workers/newsletter/src/__tests__/archive.test.ts
describe('Archive API', () => {
  it('公開記事のみ取得される');
  it('ページネーションが正しく動作する');
  it('slug重複時にエラーを返す');
  it('未公開記事は404を返す');
  it('excerpt未指定時はcontentから自動生成される');
});
```

### E2E Tests

```typescript
// e2e/archive.spec.ts (Playwright)
describe('Archive Pages', () => {
  it('一覧ページが表示される');
  it('ページネーションが機能する');
  it('個別記事ページが表示される');
  it('RSS feedが取得できる');
  it('OGPメタタグが正しく設定される');
  it('未公開記事はアクセス不可');
});
```

---

## Implementation Plan

### Phase 1: Database & API
1. Schema migration (ALTER TABLE)
2. Slug generation utility
3. Archive API endpoints
4. Unit tests

### Phase 2: Frontend
1. Archive index page
2. Article detail page
3. RSS feed
4. OGP meta tags

### Phase 3: Admin Integration
1. Admin画面にslug/is_published/excerptフィールド追加
2. 公開/非公開トグル
3. E2E tests

### Phase 4: Polish & Deploy
1. SEO最適化
2. Google Search Console設定
3. 本番デプロイ
4. ドキュメント更新

---

## Success Criteria

- [ ] `/newsletter/archive` ページで公開済み記事一覧が表示される
- [ ] 個別記事ページ（`/newsletter/archive/[slug]`）が正常に動作
- [ ] OGPメタタグが設定され、SNSシェア時に適切に表示される
- [ ] 未公開記事が一覧・個別ページに表示されない
- [ ] RSS 2.0フィード（`/newsletter/feed.xml`）が生成される
- [ ] Google Search Console でインデックス登録が確認できる
- [ ] Admin画面から記事の公開/非公開が切り替えられる
- [ ] 全Unit/E2Eテストが通る

---

## Future Enhancements (Out of Scope)

- 購読者限定記事の認証機能（Phase 5-6）
- サムネイル画像対応
- カテゴリ/タグ機能
- 全文検索
- コメント機能
- カスタムドメイン対応
