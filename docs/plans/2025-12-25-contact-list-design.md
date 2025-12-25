# Contact List Management Design

> Batch 4C: 購読者をグループ化してリスト別配信を可能にする機能

*Created: 2025-12-25*
*Status: Design Complete - Ready for Implementation*

---

## 要件サマリー

| 項目 | 決定事項 |
|:--|:--|
| リストメンバーシップ | 重複可能（多対多） |
| キャンペーン配信 | 単一リスト選択 + 未選択時は全員配信 |
| 登録時の割り当て | Signup Page ごとにリスト指定 |
| 個別操作 | 購読者詳細 + リスト詳細の両方から操作可能 |
| インポート形式 | CSV のみ |
| インポート動作 | リスト指定必須、既存はスキップ、Double Opt-in スキップ |

---

## データモデル

### 新規テーブル

```sql
-- Contact Lists テーブル
CREATE TABLE IF NOT EXISTS contact_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Contact List Members テーブル（多対多）
CREATE TABLE IF NOT EXISTS contact_list_members (
  id TEXT PRIMARY KEY,
  contact_list_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  added_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(contact_list_id, subscriber_id),
  FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clm_list ON contact_list_members(contact_list_id);
CREATE INDEX IF NOT EXISTS idx_clm_subscriber ON contact_list_members(subscriber_id);
```

### 既存テーブル拡張

```sql
-- campaigns テーブルに追加（NULL = 全員配信）
ALTER TABLE campaigns ADD COLUMN contact_list_id TEXT
  REFERENCES contact_lists(id) ON DELETE SET NULL;

-- signup_pages テーブルに追加（NULL = リスト割り当てなし）
ALTER TABLE signup_pages ADD COLUMN contact_list_id TEXT
  REFERENCES contact_lists(id) ON DELETE SET NULL;
```

### 削除時の動作

- リスト削除時 → `contact_list_members` レコードが削除（購読者自体は残る）
- 購読者削除時 → `contact_list_members` レコードが削除
- リスト削除時 → `campaigns.contact_list_id` / `signup_pages.contact_list_id` が NULL に

---

## API エンドポイント

### Contact List CRUD

| Method | Endpoint | 用途 |
|:--|:--|:--|
| GET | `/api/contact-lists` | リスト一覧（メンバー数含む） |
| GET | `/api/contact-lists/:id` | リスト詳細 |
| POST | `/api/contact-lists` | リスト作成 |
| PUT | `/api/contact-lists/:id` | リスト更新 |
| DELETE | `/api/contact-lists/:id` | リスト削除 |

### メンバー管理（リスト視点）

| Method | Endpoint | 用途 |
|:--|:--|:--|
| GET | `/api/contact-lists/:listId/members` | リストのメンバー一覧 |
| POST | `/api/contact-lists/:listId/members` | リストにメンバー追加 |
| DELETE | `/api/contact-lists/:listId/members/:subscriberId` | リストからメンバー削除 |

### メンバー管理（購読者視点）

| Method | Endpoint | 用途 |
|:--|:--|:--|
| GET | `/api/subscribers/:subscriberId/lists` | 購読者の所属リスト一覧 |
| POST | `/api/subscribers/:subscriberId/lists` | 購読者をリストに追加 |
| DELETE | `/api/subscribers/:subscriberId/lists/:listId` | 購読者をリストから削除 |

### インポート/エクスポート

| Method | Endpoint | 用途 |
|:--|:--|:--|
| POST | `/api/contact-lists/:id/import` | CSV インポート |
| GET | `/api/contact-lists/:id/export` | CSV エクスポート |

---

## UI 設計

### ページ構成

| ページ | パス | 内容 |
|:--|:--|:--|
| リスト一覧 | `/admin/contact-lists` | リスト一覧、作成/編集モーダル |
| リスト詳細 | `/admin/contact-lists/detail?id=` | メンバー管理、インポート/エクスポート |

### 既存ページの拡張

| ページ | 追加内容 |
|:--|:--|
| 購読者詳細 | 所属リストセクション（一覧、追加/削除） |
| キャンペーン作成/編集 | リスト選択ドロップダウン |
| Signup Page 編集 | リスト選択ドロップダウン |

### UI コンポーネント

| コンポーネント | 用途 |
|:--|:--|
| `ContactListList.tsx` | リスト一覧（作成/編集モーダル含む） |
| `ContactListFormModal.tsx` | リスト作成/編集モーダル |
| `ContactListDetail.tsx` | リスト詳細（メンバー管理） |
| `SubscriberListsSection.tsx` | 購読者詳細ページ用リストセクション |
| `ListSelector.tsx` | キャンペーン/Signup Page 用ドロップダウン |
| `CsvImportModal.tsx` | CSV インポートモーダル |

---

## 配信ロジック

### キャンペーン配信

```typescript
// campaign-send.ts の変更
if (campaign.contact_list_id) {
  // リスト指定あり → そのリストの active メンバーのみ
  const subscribers = await db.prepare(`
    SELECT s.* FROM subscribers s
    JOIN contact_list_members clm ON s.id = clm.subscriber_id
    WHERE clm.contact_list_id = ? AND s.status = 'active'
  `).bind(campaign.contact_list_id).all();
} else {
  // リスト未指定 → 全員配信（既存動作を維持）
  const subscribers = await db.prepare(
    "SELECT * FROM subscribers WHERE status = 'active'"
  ).all();
}
```

---

## Signup Page 連携

### 登録フロー

```
購読者が Signup Page で登録
       ↓
Double Opt-in 確認完了
       ↓
contact_list_id 設定あり → contact_list_members に追加
       ↓
sequence_id 設定あり → シーケンスにエンロール（既存機能）
```

### 実装

```typescript
// subscribe.ts の確認処理に追加
if (signupPage?.contact_list_id) {
  await db.prepare(`
    INSERT OR IGNORE INTO contact_list_members
    (id, contact_list_id, subscriber_id)
    VALUES (?, ?, ?)
  `).bind(generateId(), signupPage.contact_list_id, subscriber.id).run();
}
```

---

## CSV インポート/エクスポート

### エクスポート形式

```csv
email,name,status,subscribed_at
test@example.com,田中太郎,active,2025-01-15
user@example.com,山田花子,active,2025-01-20
```

### インポート処理

1. CSV アップロード（リスト詳細ページから）
2. バリデーション（email 形式チェック）
3. 既存 email → スキップ（リストに追加のみ）
4. 新規 email → subscribers に追加 + リストに追加（status = 'active'）
5. 結果表示（追加数、スキップ数、エラー数）

**Note:** インポート時は Double Opt-in をスキップ（管理者による意図的なインポートのため）

---

## 実装タスク対応

| MVP タスク | 対応する実装 |
|:--|:--|
| 4C-1: Contact List CRUD API | リスト CRUD API |
| 4C-2: 購読者のリスト割り当て | メンバー管理 API + Signup Page 連携 |
| 4C-3: リスト別配信機能 | campaign-send.ts の拡張 |
| 4C-4: Contact List 管理 UI | 全 UI コンポーネント |
| 4C-5: 一括インポート/エクスポート | CSV インポート/エクスポート API + UI |

---

## 参考

- 既存実装: Batch 4A（Signup Pages）の構造を参考
- テストパターン: `workers/newsletter/src/__tests__/signup-pages.test.ts`
