# Batch S: Security & Spam Prevention Design

*Created: 2025-12-25*
*Status: Approved*

---

## Overview

Newsletter システムのセキュリティ強化。レート制限と使い捨てメールブロックを実装する。

**対象タスク:**
- S-2: レート制限
- S-3: IP 制限 → レート制限に統合
- S-4: 使い捨てメールブロック

---

## Architecture

```
購読登録リクエスト
       │
       ▼
┌──────────────────┐
│  1. Turnstile    │ ← 既存（ボット対策）
│     検証         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  2. レート制限    │ ← 新規（KV カウンター）
│  5件/10分/IP     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  3. 使い捨て      │ ← 新規（静的リスト）
│  メールチェック   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  4. 購読登録処理  │ ← 既存
│  (D1 + Resend)   │
└──────────────────┘
```

---

## Design Decisions

### 1. Rate Limiting

**方式:** IP アドレスベース
**閾値:** 5件/10分
**ストレージ:** Cloudflare KV

**KV キー設計:**
```
キー: rate:subscribe:{ip}
値: カウント数（整数）
TTL: 600秒（10分）
```

**理由:**
- IP ベースはスパムに効果的
- KV は低コスト、TTL 自動削除対応
- 5件/10分は通常利用には十分、スパムには厳しい

### 2. Disposable Email Blocking

**方式:** 静的リスト（約200ドメイン）
**ソース:** disposable-email-domains GitHub リポジトリから主要ドメインを抽出

**理由:**
- 外部API依存なし
- メンテナンス不要
- 個人利用には十分な精度

### 3. IP Restriction

**決定:** 追加実装なし

**理由:**
- レート制限が IP 制限の役割を果たす
- 追加のブロックリスト管理は運用負荷増

---

## Implementation Details

### New Files

#### `workers/newsletter/src/lib/rate-limiter.ts`

```typescript
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  limit: number = 5,
  windowSeconds: number = 600
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:subscribe:${ip}`;
  const current = parseInt(await kv.get(key) || '0', 10);

  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });

  return { allowed: true, remaining: limit - current - 1 };
}
```

#### `workers/newsletter/src/lib/disposable-emails.ts`

```typescript
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  // ... 約200ドメイン
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}
```

### Modified Files

#### `workers/newsletter/wrangler.toml`

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "xxx"
preview_id = "yyy"
```

#### `workers/newsletter/src/types.ts`

```typescript
export interface Env {
  // 既存...
  RATE_LIMIT_KV: KVNamespace;
}
```

#### `workers/newsletter/src/routes/subscribe.ts`

処理順序:
1. Turnstile 検証（既存）
2. レート制限チェック（新規）
3. 使い捨てメールチェック（新規）
4. 購読登録処理（既存）

---

## Error Responses

| Check | Status | Message |
|-------|--------|---------|
| Rate limit exceeded | 429 | Too many requests. Please try again later. |
| Disposable email | 400 | Please use a permanent email address |

---

## Testing Strategy

1. **rate-limiter.test.ts**
   - 制限内: 5回まで allowed=true
   - 制限超過: 6回目で allowed=false

2. **disposable-emails.test.ts**
   - 使い捨てドメイン検出
   - 通常ドメイン通過
   - 大文字小文字無視

3. **subscribe.test.ts（統合）**
   - レート制限で 429 返却
   - 使い捨てメールで 400 返却

---

## Deployment Steps

1. KV namespace 作成: `wrangler kv:namespace create RATE_LIMIT_KV`
2. wrangler.toml に ID 追加
3. コード変更をデプロイ
4. 動作確認

---

## Future Considerations

- グローバルレート制限（DDoS対策）が必要になった場合は追加検討
- 使い捨てドメインリストの定期更新（現状は静的で十分）
