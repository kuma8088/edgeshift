# Tracking Foundation (Batch 3B) Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** クリックイベントとシーケンス配信ログのトラッキング基盤を構築する

**Architecture:** 既存の `delivery_logs` テーブルを拡張し、シーケンスメールも統一的に記録。`click_events` テーブルで全クリックを記録。

**Tech Stack:** Cloudflare Workers, D1, TypeScript

---

## Design Decisions

### Decision 1: クリック記録の粒度

**選択: 全クリック記録**

- 同じユーザーが同じURLを複数回クリックした場合も全て記録
- 行動分析（何時にクリックしたか、何回クリックしたか）が可能
- データ量は多めだが、分析の柔軟性を優先

### Decision 2: シーケンス配信ログのテーブル設計

**選択: 既存テーブル拡張（B案）**

MVPドキュメントでは `sequence_delivery_logs` を新規作成する設計だったが、以下の理由で `delivery_logs` を拡張する方針に変更：

1. **Webhook処理がシンプル** - Resendは`resend_id`でイベントを送ってくる。1テーブルで検索すれば済む
2. **分析が統一的** - キャンペーン/シーケンスを横断した分析が1クエリで可能
3. **コード量削減** - 既存の`recordDeliveryLogs`、`updateDeliveryStatus`をそのまま活用可能
4. **実データ量** - ニュースレターMVPの規模なら、1テーブルで十分なパフォーマンス

---

## Data Model

### delivery_logs テーブル（拡張）

```sql
-- 既存カラムに追加
ALTER TABLE delivery_logs ADD COLUMN sequence_id TEXT;
ALTER TABLE delivery_logs ADD COLUMN sequence_step_id TEXT;
CREATE INDEX idx_delivery_logs_sequence ON delivery_logs(sequence_id);
CREATE INDEX idx_delivery_logs_sequence_step ON delivery_logs(sequence_step_id);
```

**判定ロジック：**
- `campaign_id` が設定 → キャンペーンメール
- `sequence_id` が設定 → シーケンスメール

### click_events テーブル（新規）

```sql
CREATE TABLE click_events (
  id TEXT PRIMARY KEY,
  delivery_log_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX idx_click_events_delivery_log ON click_events(delivery_log_id);
CREATE INDEX idx_click_events_subscriber ON click_events(subscriber_id);
CREATE INDEX idx_click_events_clicked_at ON click_events(clicked_at);
```

- `delivery_log_id` から `campaign_id` or `sequence_id` を辿れる
- シンプルな正規化設計

---

## Implementation Changes

### 3B-3: Webhook で `click.link` 記録

**File: `workers/newsletter/src/routes/webhook.ts`**

```typescript
case 'email.clicked':
  newStatus = 'clicked';
  // 新規: クリックイベントを記録
  if (event.data.click?.link) {
    await recordClickEvent(env, {
      deliveryLogId: deliveryLog.id,
      subscriberId: deliveryLog.subscriber_id,
      clickedUrl: event.data.click.link,
    });
  }
  break;
```

**New function: `recordClickEvent` in `lib/delivery.ts`**

- `click_events` テーブルに INSERT
- 同じURLでも毎回記録（全クリック記録）

### 3B-4: シーケンス送信時のログ記録

**File: `workers/newsletter/src/lib/sequence-processor.ts`**

```typescript
const result = await sendEmail(...);

if (result.success) {
  // 新規: delivery_logs に記録
  await recordSequenceDeliveryLog(env, {
    sequenceId: email.sequence_id,
    sequenceStepId: email.step_id,
    subscriberId: email.subscriber_id,
    email: email.email,
    resendId: result.id,
  });

  // 既存: 進捗更新
  await updateProgress(...);
}
```

**ポイント：**
- `sendEmail` の戻り値から `resend_id` を取得
- これによりWebhookイベントと紐付け可能に

---

## Error Handling

### Webhook処理（click_events記録）

- クリック記録の失敗はログ出力のみ、Webhook応答は`200 OK`を返す
- 理由：Resendが再送を繰り返すのを防ぐ、本体のステータス更新は成功している

```typescript
try {
  await recordClickEvent(env, ...);
} catch (error) {
  console.error('Failed to record click event:', error);
  // Webhook自体は成功として返す
}
```

### シーケンス送信（delivery_logs記録）

- ログ記録失敗時も送信自体は成功扱い（メールは届いている）
- ただし警告ログを出力して運用で検知

---

## Testing Strategy

| テスト対象 | テスト内容 |
|:--|:--|
| `recordClickEvent` | 正常記録、同URL複数記録、無効なdelivery_log_id |
| `recordSequenceDeliveryLog` | 正常記録、resend_id保存確認 |
| Webhook統合 | `email.clicked`イベント → click_events記録確認 |
| シーケンス統合 | 送信 → delivery_logs記録 → Webhook → ステータス更新 |

---

## MVP Document Update

この設計により、MVPドキュメントの以下のタスクが変更されます：

| 元タスク | 変更後 |
|:--|:--|
| 3B-1: `click_events` テーブル作成 | そのまま |
| 3B-2: `sequence_delivery_logs` テーブル作成 | → `delivery_logs` 拡張に変更 |
| 3B-3: Webhook で `click.link` 記録 | そのまま |
| 3B-4: シーケンス送信時のログ記録 | そのまま（`delivery_logs` に記録） |

---

*Created: 2024-12-24*
