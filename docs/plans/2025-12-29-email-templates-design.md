# メールテンプレート機能 設計ドキュメント

> 作成日: 2025-12-29
> ステータス: 承認済み

## 1. スコープ

### 対象

- **ターゲット**: 将来のマルチテナントSaaS対応を見据えた設計
- **テンプレート方式**: 5種類のプリセット（ファイルベース）+ ブランド設定（DB）
- **ブランド設定**: ロゴURL、メインカラー、サブカラー、フッターテキスト
- **テンプレート選択**: デフォルト設定 + 送信時オーバーライド
- **共通部品**: キャンペーンとシーケンス両方で使用可能
- **変数**: 基本のみ（`{{subscriber.name}}`, `{{unsubscribe_url}}`）
- **プレビュー**: PC/モバイル切り替え + テストメール送信
- **メール互換性**: インラインスタイル適用

### 対象外（YAGNI）

- HTML直接編集
- カスタムテンプレートのDB保存
- カスタム変数
- MJMLフレームワーク
- ドラッグ&ドロップエディタ

---

## 2. アーキテクチャ

### 共通テンプレートエンジンの構造

```
workers/newsletter/src/
├── lib/
│   └── templates/
│       ├── index.ts           # テンプレートエンジン本体
│       ├── presets/           # プリセットテンプレート
│       │   ├── simple.ts
│       │   ├── newsletter.ts
│       │   ├── announcement.ts
│       │   ├── welcome.ts
│       │   └── product-update.ts
│       └── variables.ts       # 変数置換ロジック
├── routes/
│   ├── campaign-send.ts      # ← テンプレートエンジンを使用
│   └── sequences.ts          # ← 同じエンジンを使用（共通部品）
```

### レンダリングフロー

```
1. 送信時に呼び出し
   ↓
2. BrandSettings を DB から取得
   ↓
3. template_id から preset を選択
   ↓
4. 変数を置換 ({{subscriber.name}}, {{unsubscribe_url}})
   ↓
5. インラインCSS適用済み HTML を返却
```

### 共通関数シグネチャ

```typescript
interface RenderOptions {
  templateId: string;        // 'simple' | 'newsletter' | ...
  content: string;           // 本文（キャンペーン or ステップ）
  subject: string;           // 件名
  brandSettings: BrandSettings;
  subscriber: { name?: string; email: string };
  unsubscribeUrl: string;
}

function renderEmail(options: RenderOptions): string
```

キャンペーン送信もシーケンス送信も、この `renderEmail()` を呼ぶだけ。

---

## 3. データモデル

### 新規テーブル: brand_settings

```sql
CREATE TABLE IF NOT EXISTS brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',  -- 現状シングルテナント
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',   -- 現在のアクセントカラー
  secondary_color TEXT DEFAULT '#1e1e1e',
  footer_text TEXT DEFAULT 'EdgeShift Newsletter',
  default_template_id TEXT DEFAULT 'simple',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

### campaigns テーブル変更

```sql
ALTER TABLE campaigns ADD COLUMN template_id TEXT DEFAULT NULL;
-- NULL = brand_settings.default_template_id を使用
```

### sequence_steps テーブル変更

```sql
ALTER TABLE sequence_steps ADD COLUMN template_id TEXT DEFAULT NULL;
-- NULL = brand_settings.default_template_id を使用
```

### template_id の値

DB には `'simple'`, `'newsletter'` 等の文字列を保存。プリセットファイル名と対応：

| template_id | ファイル | 用途 |
|-------------|----------|------|
| `simple` | simple.ts | シンプル（テキスト中心） |
| `newsletter` | newsletter.ts | ニュースレター（ヘッダー付き） |
| `announcement` | announcement.ts | お知らせ（強調表示） |
| `welcome` | welcome.ts | ウェルカム（挨拶系） |
| `product-update` | product-update.ts | 製品アップデート |

---

## 4. API エンドポイント

### ブランド設定 API

```
GET  /api/brand-settings
  → BrandSettings を返却

PUT  /api/brand-settings
  → BrandSettings を更新
  Body: { logo_url, primary_color, secondary_color, footer_text, default_template_id }
```

### テンプレート一覧 API

```
GET  /api/templates
  → プリセット一覧を返却
  Response: [
    { id: 'simple', name: 'シンプル', description: 'テキスト中心のシンプルなレイアウト' },
    { id: 'newsletter', name: 'ニュースレター', description: 'ヘッダー付きの定番スタイル' },
    ...
  ]
```

### プレビュー API

```
POST /api/templates/preview
  Body: {
    template_id: string,
    content: string,
    subject: string,
    brand_settings?: Partial<BrandSettings>  // 未保存の設定でプレビュー可
  }
  → { html: string }  // レンダリング済み HTML
```

### テストメール送信 API

```
POST /api/templates/test-send
  Body: {
    template_id: string,
    content: string,
    subject: string,
    to: string  // 送信先メールアドレス
  }
  → { success: boolean, message_id?: string }
```

### 既存 API の変更

```
POST /api/campaigns
PUT  /api/campaigns/:id
  Body に template_id を追加（optional）

PUT  /api/sequences/:id/steps/:stepId
  Body に template_id を追加（optional）
```

---

## 5. 管理画面 UI

### ブランド設定ページ（新規）

```
/admin/settings/brand

┌─────────────────────────────────────────────┐
│ ブランド設定                                  │
├─────────────────────────────────────────────┤
│ ロゴURL:      [https://...            ]     │
│ メインカラー:  [■ #7c3aed] ← カラーピッカー   │
│ サブカラー:    [■ #1e1e1e]                   │
│ フッターテキスト: [EdgeShift Newsletter  ]    │
│ デフォルトテンプレート: [▼ シンプル]          │
│                                             │
│              [保存]                          │
└─────────────────────────────────────────────┘
```

### プレビューモーダル（共通コンポーネント）

```
┌─────────────────────────────────────────────────────┐
│ プレビュー                         [PC] [モバイル]  │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │   （レンダリングされたメール）              │   │
│  │                                             │   │
│  │   PC: width 600px                           │   │
│  │   モバイル: width 375px                     │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  テスト送信先: [test@example.com] [テスト送信]      │
│                                     [閉じる]        │
└─────────────────────────────────────────────────────┘
```

### キャンペーン作成/編集画面の変更

```
既存フォームに追加:
┌─────────────────────────────────────────────┐
│ テンプレート: [▼ デフォルト（シンプル）]      │
│              [プレビュー]                    │
└─────────────────────────────────────────────┘
```

シーケンスステップ編集も同様に `template_id` セレクトを追加。

---

## 6. テスト方針

### ユニットテスト

```typescript
// workers/newsletter/src/__tests__/templates.test.ts

describe('Template Engine', () => {
  describe('renderEmail', () => {
    it('should render simple template with brand settings', () => {});
    it('should replace {{subscriber.name}} variable', () => {});
    it('should replace {{unsubscribe_url}} variable', () => {});
    it('should apply primary_color to links', () => {});
    it('should include footer_text', () => {});
    it('should fallback to default when name is empty', () => {});
  });

  describe('each preset', () => {
    it('simple: renders text-focused layout', () => {});
    it('newsletter: renders header with logo', () => {});
    it('announcement: renders emphasized style', () => {});
    it('welcome: renders greeting style', () => {});
    it('product-update: renders feature list style', () => {});
  });
});
```

### 統合テスト

```typescript
describe('Brand Settings API', () => {
  it('GET /api/brand-settings returns settings', () => {});
  it('PUT /api/brand-settings updates settings', () => {});
});

describe('Preview API', () => {
  it('POST /api/templates/preview returns rendered HTML', () => {});
  it('applies unsaved brand settings to preview', () => {});
});

describe('Campaign with template', () => {
  it('uses specified template_id when sending', () => {});
  it('falls back to default_template_id when null', () => {});
});
```

### 手動確認項目

- [ ] 各テンプレートが PC/モバイルで正しく表示される
- [ ] Gmail, Apple Mail, Outlook で崩れないか確認
- [ ] テスト送信が実際に届くか確認

---

## 7. 完了基準

mvp_additional_features.md より:

- [x] 5種類のテンプレートから選択可能
- [x] プレビュー機能あり（PC/モバイル切り替え）
- [x] 変数（購読者名、解除URL）が使える
- [x] レスポンシブ対応

追加要件:

- [x] キャンペーンとシーケンス両方で使用可能（共通部品）
- [x] ブランド設定でカスタマイズ可能
- [x] テストメール送信機能
