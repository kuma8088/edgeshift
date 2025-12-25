# Session Notes: Batch_4C - Contact List Management

## 現在の状態

**フェーズ:** 要件定義（Brainstorming）

**進捗:**
- ✅ Batch 4A, 4B, 4C の依存関係調査完了
- ✅ Batch 4C が独立実装可能であることを確認
- 🔄 `superpowers:brainstorming` スキルで要件定義中

**完了タスク:**
- Batch 4B の依存関係調査（4A に依存なし → 既存フォーム埋め込み可能）
- Batch 4C の依存関係調査（4A, 4B に依存なし → 独立実装可能）
- 現在のスキーマとコード実装の確認

**未完了タスク:**
- Batch 4C の要件定義（進行中）
- 設計ドキュメント作成
- 実装計画作成
- 実装

---

## 直近の問題・解決

**問題:** Batch 4A, 4B, 4C の依存関係が不明確
**解決:** Explore サブエージェントで調査し、すべて独立実装可能と確認

**発見事項:**
- Contact List 関連テーブルは未実装（contact_lists, contact_list_members）
- campaigns テーブルに contact_list_id カラムなし
- campaign-send.ts は全 active 購読者への配信のみサポート

---

## 次にやること

### 1. 要件定義完了（優先度：最高）
- [ ] リストメンバーシップモデルの決定（重複可能 vs 排他的）
- [ ] キャンペーンのリスト選択方式（単一 vs 複数）
- [ ] 既存キャンペーンの互換性戦略
- [ ] デフォルトリストの扱い
- [ ] インポート/エクスポート仕様

### 2. 設計ドキュメント作成
- [ ] `docs/plans/YYYY-MM-DD-contact-list-design.md` 作成
- [ ] スキーマ設計
- [ ] API エンドポイント設計
- [ ] UI 設計

### 3. 実装計画作成
- [ ] `superpowers:writing-plans` で詳細実装計画作成
- [ ] タスク分割（4C-1 〜 4C-5）

### 4. 実装
- [ ] スキーマ変更（contact_lists, contact_list_members テーブル追加）
- [ ] CRUD API 実装
- [ ] キャンペーン配信ロジック拡張
- [ ] 管理 UI 実装
- [ ] インポート/エクスポート機能

---

## 判断メモ

### 設計判断（要確認）

**リストメンバーシップ:**
- 推奨: 重複可能（多対多）
- 理由: 柔軟性が高く、一般的なニュースレターサービスのパターン
- ユーザー確認待ち

**キャンペーン配信:**
- 候補1: 単一リスト選択（シンプル）
- 候補2: 複数リスト選択（柔軟）
- 候補3: リスト + 追加フィルタ（高度）
- ユーザー確認待ち

**既存キャンペーン互換性:**
- contact_list_id を NULL 許可
- NULL = 全 active 購読者（現在の動作を維持）

**デフォルトリスト:**
- 候補1: 自動作成しない（管理者が明示的に作成）
- 候補2: "All Subscribers" リストを自動作成
- ユーザー確認待ち

---

## ブロッカー

**現在なし**

---

## 技術メモ

### スキーマ変更の影響範囲

**新規テーブル:**
```sql
CREATE TABLE contact_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE contact_list_members (
  id TEXT PRIMARY KEY,
  contact_list_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(contact_list_id, subscriber_id),
  FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);
```

**既存テーブル拡張:**
```sql
ALTER TABLE campaigns ADD COLUMN contact_list_id TEXT;
```

**変更が必要なファイル:**
- `workers/newsletter/schema.sql`
- `workers/newsletter/src/routes/campaign-send.ts`
- `workers/newsletter/src/types.ts`

**新規作成が必要なファイル:**
- `workers/newsletter/src/routes/contact-lists.ts`
- `src/components/admin/ContactListForm.tsx`
- `src/pages/admin/contact-lists/index.astro`

---

**Last Updated:** 2025-12-25
**Session:** Batch_4B
**Model:** Sonnet 4.5
