# CSV Import/Export Design

> **Status:** Approved
> **Created:** 2026-01-15
> **GAPs:** GAP-NL-001 (API), GAP-ADMIN-003 (UI)

## Summary

systeme.io からの購読者移行を主目的とした CSV インポート/エクスポート機能。

## Requirements

### CSV Import

| 項目 | 仕様 |
|------|------|
| 対応カラム | `email` (必須), `first_name`, `last_name` (任意) |
| ヘッダー名 | 柔軟対応 (`email`, `Eメール`, `Email` 等) |
| 初期ステータス | `active` (即時有効、確認メールなし) |
| 重複処理 | スキップ (既存データ保持、件数レポート) |
| リスト追加 | 任意 (選択すれば追加) |
| 姓名結合 | `first_name` + `last_name` → `subscribers.name` |

### CSV Export

| 項目 | 仕様 |
|------|------|
| 出力カラム | `email`, `first_name`, `last_name`, `status`, `created_at` |
| 対象 | 全購読者 or 特定リストのメンバー |
| フィルタ | ステータス (active / unsubscribed / all) |

## API Design

### POST /api/subscribers/import

```
Content-Type: multipart/form-data
Body:
  - file: CSV file
  - contact_list_id: string (optional)

Response:
{
  "imported": 150,
  "skipped": 10,
  "errors": [
    { "row": 5, "email": "invalid-email", "reason": "Invalid email format" }
  ]
}
```

### GET /api/subscribers/export

```
Query:
  - contact_list_id: string (optional)
  - status: "active" | "unsubscribed" | "all" (default: "all")

Response: CSV file download
```

## Processing Flow

### Import

1. CSV パース (ヘッダー検出)
2. 各行バリデーション (メール形式チェック)
3. 既存メール重複チェック → スキップ
4. `subscribers` テーブルに INSERT (status: active)
5. contact_list_id 指定時は `contact_list_members` にも INSERT
6. 結果サマリを返却

### Export

1. クエリ条件で購読者を取得
2. `splitName()` で姓名分割
3. CSV 形式でレスポンス

## UI Design

### Import Modal

```
┌─────────────────────────────────────────────────┐
│  CSVインポート                              [×] │
├─────────────────────────────────────────────────┤
│  ファイル: [ファイルを選択] sample.csv          │
│                                                 │
│  リストに追加（任意）:                          │
│  [▼ 選択してください        ]                  │
│                                                 │
│  プレビュー (先頭5件):                          │
│  ┌──────────────────────────────────────────┐  │
│  │ email              │ 名前               │  │
│  │ test@example.com   │ 山田 太郎          │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│                      [キャンセル] [インポート]  │
└─────────────────────────────────────────────────┘
```

### Export Modal

```
┌─────────────────────────────────────────────────┐
│  CSVエクスポート                            [×] │
├─────────────────────────────────────────────────┤
│  対象:                                          │
│  ○ 全購読者                                    │
│  ○ リストを選択: [▼ Import              ]     │
│                                                 │
│  ステータス:                                    │
│  ○ 有効のみ (active)                           │
│  ○ 全て                                        │
│                                                 │
│                      [キャンセル] [エクスポート]│
└─────────────────────────────────────────────────┘
```

## Error Handling

| エラー種別 | 処理 |
|-----------|------|
| ファイル形式不正 (CSV以外) | 即座にエラー返却 |
| ヘッダーに email 列なし | 即座にエラー返却 |
| メール形式不正 (行単位) | スキップ、errors 配列に追加 |
| メール重複 (既存) | スキップ、skipped カウント |
| 空行 | 無視 |

## Implementation Plan

### Files to Change

| Layer | File | Change |
|-------|------|--------|
| API | `workers/newsletter/src/routes/import-export.ts` | Create |
| API | `workers/newsletter/src/index.ts` | Add routes |
| API | `workers/newsletter/src/types.ts` | Add types |
| UI | `src/components/admin/ImportModal.tsx` | Create |
| UI | `src/components/admin/ExportModal.tsx` | Create |
| UI | `src/components/admin/SubscriberList.tsx` | Add buttons |
| UI | `src/utils/admin-api.ts` | Add API functions |
| Test | `workers/newsletter/src/__tests__/import-export.test.ts` | Create |

### Test Cases

- Normal import (email only / email + name)
- Header name variations (`email`, `Eメール`, `Email`)
- Duplicate skip
- Invalid email format skip
- With/without contact list
- Export (all / list filter / status filter)

## References

- Existing `splitName()` in `workers/newsletter/src/lib/resend-marketing.ts`
- GAP-NL-001: 一括インポート/エクスポート (P3)
- GAP-ADMIN-003: インポート/エクスポート (P2)
