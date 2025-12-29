# Referral Program Design

**Date:** 2025-12-29
**Status:** In Progress
**Branch:** feature/referral-program

## Overview

Newsletter購読者が友人を紹介することで報酬（バッジ、特典）を得られるリファラルプログラムを実装する。

## Goals

1. 購読確認後に一意のリファラルコードを自動生成
2. リファラルリンク経由での登録を追跡
3. マイルストーン達成時に通知（3人、10人、50人紹介など）
4. 管理者がマイルストーンと報酬を設定可能

## Database Schema

### 1. subscribers テーブル拡張

```sql
ALTER TABLE subscribers ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE subscribers ADD COLUMN referred_by TEXT REFERENCES subscribers(id);
ALTER TABLE subscribers ADD COLUMN referral_count INTEGER DEFAULT 0;
CREATE INDEX idx_subscribers_referral_code ON subscribers(referral_code);
```

### 2. referral_milestones テーブル（新規）

```sql
CREATE TABLE IF NOT EXISTS referral_milestones (
  id TEXT PRIMARY KEY,
  threshold INTEGER NOT NULL UNIQUE,  -- 達成に必要な紹介数
  name TEXT NOT NULL,                 -- "Bronze Referrer", "Gold Advocate"など
  description TEXT,
  reward_type TEXT CHECK (reward_type IN ('badge', 'discount', 'content', 'custom')),
  reward_value TEXT,                  -- バッジ名、割引コード、コンテンツURLなど
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 3. referral_achievements テーブル（新規）

```sql
CREATE TABLE IF NOT EXISTS referral_achievements (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  achieved_at INTEGER NOT NULL,
  notified_at INTEGER,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES referral_milestones(id) ON DELETE CASCADE,
  UNIQUE(subscriber_id, milestone_id)
);

CREATE INDEX idx_achievements_subscriber ON referral_achievements(subscriber_id);
CREATE INDEX idx_achievements_pending ON referral_achievements(notified_at);
```

## API Endpoints

### Public API

#### POST /api/subscribe
拡張：`ref` パラメータを受け付ける

```typescript
interface SubscribeRequest {
  email: string;
  name?: string;
  turnstileToken: string;
  sequenceId?: string;
  signupPageSlug?: string;
  ref?: string;  // リファラルコード（新規）
}
```

#### GET /api/referral/dashboard/:referralCode
購読者用ダッシュボード情報を取得

```typescript
interface ReferralDashboardResponse {
  referral_code: string;
  referral_link: string;
  referral_count: number;
  achievements: {
    id: string;
    milestone_name: string;
    threshold: number;
    achieved_at: number;
    reward_type: string;
    reward_value: string;
  }[];
  next_milestone?: {
    name: string;
    threshold: number;
    remaining: number;
  };
}
```

### Admin API (要認証)

#### GET /api/admin/milestones
マイルストーン一覧取得

#### POST /api/admin/milestones
マイルストーン作成

```typescript
interface CreateMilestoneRequest {
  threshold: number;
  name: string;
  description?: string;
  reward_type: 'badge' | 'discount' | 'content' | 'custom';
  reward_value?: string;
}
```

#### PUT /api/admin/milestones/:id
マイルストーン更新

#### DELETE /api/admin/milestones/:id
マイルストーン削除

#### GET /api/admin/referral-stats
リファラル統計情報

```typescript
interface ReferralStatsResponse {
  total_referrals: number;
  active_referrers: number;  // 1人以上紹介した人
  top_referrers: {
    id: string;
    email: string;
    referral_count: number;
  }[];
}
```

## Implementation Phases

### Phase 1: DB Schema Migration

1. `schema.sql` にテーブル定義を追加
2. ローカルD1にマイグレーション適用
3. 本番適用はPRマージ後

### Phase 2: Worker API

1. `subscribe.ts` の拡張
   - `ref` パラメータを受け取り、`referred_by` を設定
   - 紹介者が存在する場合のみ記録

2. `confirm.ts` の拡張
   - 確認完了時に `referral_code` を生成
   - 紹介者の `referral_count` をインクリメント
   - マイルストーン達成をチェックし、`referral_achievements` に記録

3. 新規ルート `routes/referral.ts`
   - `/api/referral/dashboard/:referralCode` 実装

4. 新規ルート `routes/milestones.ts`
   - Admin API実装

5. `scheduled.ts` の拡張
   - 未通知の達成をチェックし、メール送信

### Phase 3: Frontend

1. 確認完了ページ (`/newsletter/confirmed`)
   - リファラルリンクを表示
   - コピーボタン

2. リファラルダッシュボード (`/newsletter/referrals/:code`)
   - 紹介数表示
   - 達成バッジ表示
   - 次のマイルストーンまでの進捗

3. 管理画面 (`/admin/referrals/`)
   - マイルストーン設定
   - 統計ダッシュボード

## Referral Code Generation

```typescript
function generateReferralCode(): string {
  // 8文字の英数字（読みやすさ重視でO,0,I,1を除外）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code;
}
```

## Email Templates

### 達成通知メール

```html
Subject: 🎉 紹介マイルストーン達成！ - EdgeShift Newsletter

{name}さん、

おめでとうございます！{milestone_name}を達成しました。
{threshold}人の方があなたの紹介でニュースレターに登録されました。

報酬: {reward_description}

引き続き、EdgeShift Newsletterをお楽しみください。
```

## Testing Strategy

### Unit Tests

- `referral.test.ts`: ダッシュボードAPI、紹介追跡
- `milestones.test.ts`: マイルストーンCRUD
- `confirm.test.ts`: リファラルコード生成、カウント更新

### Integration Tests

- 登録フロー全体（ref付き登録 → 確認 → カウント更新）
- マイルストーン達成 → 通知フロー

## Security Considerations

1. リファラルコードは推測困難な8文字ランダム
2. ダッシュボードは紹介コードで認証（メールでのみ送信）
3. 自己紹介防止：同一IPからの登録は紹介としてカウントしない（オプション）

## Migration Path

1. feature/referral-program ブランチで実装
2. PR作成・レビュー
3. マージ後、本番D1にスキーマ適用
4. Worker再デプロイ
