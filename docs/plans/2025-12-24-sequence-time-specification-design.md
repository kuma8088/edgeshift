# Sequence Time Specification Design

> Batch 3D: シーケンス機能強化

*Created: 2025-12-24*
*Status: Approved*

---

## 概要

シーケンスメールに時間指定機能を追加し、「登録から3日後の10:00に送信」のような制御を可能にする。

## 要件

### 3D-1: 時間指定機能

- **粒度**: 時間+分（HH:MM形式）
- **タイムゾーン**: JST固定（DBはUTC保存、表示時JST変換）
- **構造**:
  - シーケンス単位で `default_send_time`（必須）
  - ステップ単位で `delay_time`（オプション、上書き用）

### 3D-2: UI改善

- シーケンスに `default_send_time` 入力欄を追加
- ステップに `delay_time` 入力欄を追加（オプション）
- ステップのドラッグ&ドロップ並び替え（@dnd-kit/core使用）
- タイムラインプレビュー機能

---

## データモデル

### sequences テーブル変更

```sql
ALTER TABLE sequences ADD COLUMN default_send_time TEXT NOT NULL DEFAULT '10:00';
```

- `default_send_time`: `"HH:MM"` 形式（JST）
- 必須フィールド、デフォルト 10:00

### sequence_steps テーブル変更

```sql
ALTER TABLE sequence_steps ADD COLUMN delay_time TEXT;
```

- `delay_time`: `"HH:MM"` 形式（JST）、nullable
- 未指定時はシーケンスの `default_send_time` を使用

---

## 送信判定ロジック

### 現行

```sql
(ss.started_at + step.delay_days * 86400) <= now
```

### 変更後

```typescript
// JST offset: +9時間 = 32400秒
const JST_OFFSET = 9 * 60 * 60;

// 送信予定日時の計算
const sendDate = started_at + (delay_days * 86400);
const sendTime = step.delay_time ?? seq.default_send_time; // "HH:MM"
const [hours, minutes] = sendTime.split(':').map(Number);

// その日のJST 00:00 を基準に時刻を加算
const sendDateJST = Math.floor((sendDate + JST_OFFSET) / 86400) * 86400 - JST_OFFSET;
const scheduledAt = sendDateJST + (hours * 3600) + (minutes * 60);

// 判定
if (now >= scheduledAt) { /* 送信 */ }
```

### 例

- 登録: 12/24 15:00 JST
- delay_days: 3
- send_time: 10:00

→ 送信予定: 12/27 10:00 JST

---

## API変更

### POST /api/sequences

```typescript
interface CreateSequenceRequest {
  name: string;
  description?: string;
  default_send_time: string; // "HH:MM" (必須)
  steps: {
    delay_days: number;
    delay_time?: string; // "HH:MM" (オプション)
    subject: string;
    content: string;
  }[];
}
```

### PUT /api/sequences/:id

```typescript
interface UpdateSequenceRequest {
  name?: string;
  description?: string;
  is_active?: number;
  default_send_time?: string; // "HH:MM"
}
```

---

## UI設計

### シーケンスフォーム

- 「デフォルト送信時刻」フィールド追加（必須、time input）
- ヘルプテキスト: 「各ステップで個別に指定しない場合、この時刻に送信されます」

### ステップエディター

- 「送信時刻」フィールド追加（オプション、time input）
- ヘルプテキスト: 「空欄の場合、シーケンスのデフォルト時刻を使用」
- ドラッグハンドル追加（@dnd-kit/core）
- 並び替え後、step_number を自動再計算

### タイムラインプレビュー

```
登録日
  │
  ├─ 即時 (10:00) ── ステップ1: ウェルカムメール
  │
  ├─ 3日後 (10:00) ── ステップ2: 機能紹介
  │
  └─ 7日後 (18:30) ── ステップ3: フォローアップ
```

---

## 実装タスク

1. DB スキーマ変更（ALTER TABLE）
2. sequence-processor.ts の時間判定ロジック修正
3. sequences.ts API の更新（型定義含む）
4. @dnd-kit/core インストール
5. SequenceStepEditor にドラッグ並び替え追加
6. 時間指定UI追加（シーケンス・ステップ）
7. タイムラインプレビュー機能追加
8. テスト追加・実行
9. デプロイ

---

## 工数見積もり

| タスク | 見積もり |
|:--|:--|
| DB + バックエンド | 2時間 |
| UI改善 | 3時間 |
| **合計** | **5時間** |
