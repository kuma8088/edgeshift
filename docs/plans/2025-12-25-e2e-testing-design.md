# E2E Testing Design

> Playwright E2E tests for Newsletter System (Batch TA)

*Created: 2025-12-25*
*Status: Design Complete - Ready for Implementation*

---

## Overview

本番環境（edgeshift.tech）に対するPlaywright E2Eテストシステム。

**目的:**
- 登録ページ → 購読 → シーケンス自動送信の完全なフロー検証
- Contact List管理の動作確認
- 本番環境での動作保証

**対象環境:** https://edgeshift.tech (本番環境)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Playwright E2E Tests (ローカル実行)         │
│                                             │
│  ├── setup/                                 │
│  │   ├── global-setup.ts    # D1接続設定   │
│  │   └── test-data.ts       # テストデータ │
│  │                                          │
│  ├── tests/                                 │
│  │   ├── signup-flow.spec.ts    # 最優先   │
│  │   ├── sequence-email.spec.ts # 最優先   │
│  │   ├── contact-list.spec.ts   # 重要     │
│  │   └── campaign.spec.ts       # あれば   │
│  │                                          │
│  └── helpers/                               │
│      ├── d1-client.ts        # D1アクセス  │
│      ├── trigger-cron.ts     # Cron手動実行│
│      └── cleanup.ts          # データ削除  │
└─────────────────────────────────────────────┘
              ↓ HTTPS
┌─────────────────────────────────────────────┐
│ 本番環境: edgeshift.tech                    │
│  ├── Pages (Astro)                          │
│  ├── Workers (API)                          │
│  └── D1 Database                            │
└─────────────────────────────────────────────┘
```

---

## Test Data Strategy

### テストアカウント

**形式:** `test+<timestamp>@edgeshift.tech`

例:
- `test+1703520000@edgeshift.tech`
- `test+signup@edgeshift.tech`

### クリーンアップ

定期的な一括削除スクリプト:

```bash
npm run test:e2e:cleanup
```

削除対象:
- `subscribers` テーブル（test+* メールアドレス）
- 関連する `delivery_logs`, `subscriber_sequences`, `contact_list_members`

---

## Email Handling

### 方針

1. **実際にメール送信** - Resend APIで確認メールを送信
2. **D1から `confirm_token` を取得** - Wrangler CLI経由でクエリ
3. **確認URLを構築** - `https://edgeshift.tech/api/newsletter/confirm/{token}`
4. **Playwrightでアクセス** - Double Opt-inフローを完了

### Turnstileスキップ

テスト用メールアドレス（`test+*@edgeshift.tech`）はTurnstile検証をスキップ。

**実装箇所:** `workers/newsletter/src/routes/subscribe.ts`

```typescript
const isTestEmail = email.startsWith('test+') && email.endsWith('@edgeshift.tech');

if (!isTestEmail) {
  // 本番: Turnstile検証
  const turnstileResult = await verifyTurnstileToken(turnstileToken, ...);
  if (!turnstileResult.success) {
    return jsonResponse({ success: false, error: 'Security verification failed' }, 400);
  }
}
```

---

## Sequence Email Testing

### 時短戦略

本番では日単位の遅延（`delay_days`）だが、テストでは即座に処理。

**方法:** Cron手動トリガー

```typescript
// テストコードから呼び出し
await fetch('https://edgeshift.tech/api/admin/trigger-cron', {
  headers: { Authorization: `Bearer ${process.env.ADMIN_API_KEY}` }
});
```

**新規エンドポイント:**
- `GET /api/admin/trigger-cron` - `processScheduledCampaigns()` を即座に実行
- 認証必須（ADMIN_API_KEY）

---

## D1 Access

### Wrangler CLI経由

```typescript
// helpers/d1-client.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function queryD1(sql: string): Promise<any[]> {
  const cmd = `wrangler d1 execute edgeshift-newsletter --remote --command "${sql}"`;
  const { stdout } = await execAsync(cmd);
  return JSON.parse(stdout).results;
}

export async function getConfirmToken(email: string): Promise<string> {
  const results = await queryD1(
    `SELECT confirm_token FROM subscribers WHERE email = '${email}'`
  );
  return results[0].confirm_token;
}

export async function getDeliveryLogs(email: string) {
  return queryD1(
    `SELECT * FROM delivery_logs WHERE email = '${email}' ORDER BY created_at DESC`
  );
}
```

---

## Test Priority

### 最優先（実装必須）

| Test | 内容 | 工数 |
|:--|:--|:--|
| signup-sequence | 登録ページ → 購読 → シーケンス送信 | 3時間 |

### 重要（次に実装）

| Test | 内容 | 工数 |
|:--|:--|:--|
| contact-list | Contact List作成・メンバー追加・配信 | 2時間 |

### あれば良い

| Test | 内容 | 工数 |
|:--|:--|:--|
| campaign | キャンペーン作成・配信 | 2時間 |
| admin-crud | 管理画面CRUD操作 | 3時間 |

---

## Directory Structure

```
tests/
├── e2e/
│   ├── setup/
│   │   ├── playwright.config.ts    # Playwright設定
│   │   └── global-setup.ts         # 環境変数チェック
│   ├── helpers/
│   │   ├── d1-client.ts            # D1クエリヘルパー
│   │   ├── trigger-cron.ts         # Cron手動トリガー
│   │   └── cleanup.ts              # テストデータ削除
│   └── specs/
│       ├── 01-signup-sequence.spec.ts    # 最優先
│       ├── 02-contact-list.spec.ts       # 重要
│       ├── 03-campaign.spec.ts           # あれば
│       └── 04-admin-crud.spec.ts         # あれば
└── unit/  # 既存のWorkerテスト
    └── __tests__/
```

---

## Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  baseURL: 'https://edgeshift.tech',
  use: {
    trace: 'on-first-retry',
  },
  timeout: 60000, // シーケンス処理待ち用（60秒）
  retries: 1,
  workers: 1, // 本番環境なので並列実行しない
});
```

---

## Sample Test Flow

```typescript
// tests/e2e/specs/01-signup-sequence.spec.ts
import { test, expect } from '@playwright/test';
import { getConfirmToken, getDeliveryLogs } from '../helpers/d1-client';
import { triggerCron } from '../helpers/trigger-cron';

test('signup page to sequence email delivery', async ({ page }) => {
  const testEmail = `test+${Date.now()}@edgeshift.tech`;

  // 1. 登録ページにアクセス
  await page.goto('/newsletter/signup/welcome');

  // 2. フォーム入力・送信
  await page.fill('[name="email"]', testEmail);
  await page.fill('[name="name"]', 'Test User');
  await page.click('button[type="submit"]');

  // 3. 成功メッセージ確認
  await expect(page.locator('text=確認メールを送信しました')).toBeVisible();

  // 4. D1から confirm_token を取得
  const token = await getConfirmToken(testEmail);
  expect(token).toBeTruthy();

  // 5. 確認URLにアクセス
  await page.goto(`/api/newsletter/confirm/${token}`);
  await expect(page).toHaveURL(/\/newsletter\/confirmed/);

  // 6. Cron手動トリガー（シーケンス処理）
  await triggerCron();

  // 7. 配信ログ確認（シーケンスメール送信）
  const logs = await getDeliveryLogs(testEmail);
  expect(logs.length).toBeGreaterThan(0);
  expect(logs[0].status).toBe('sent');
  expect(logs[0].sequence_id).toBeTruthy();
});
```

---

## CI/CD (Phase 2)

現時点ではローカル実行のみ。安定したら以下を追加：

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: workflow_dispatch  # 手動実行のみ

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Implementation Checklist

### Phase 1: Setup & Core Test

- [ ] Playwrightインストール・設定
- [ ] D1クライアント実装
- [ ] Turnstileスキップ実装（subscribe.ts修正）
- [ ] Cronトリガーエンドポイント追加
- [ ] クリーンアップスクリプト作成
- [ ] 01-signup-sequence.spec.ts 実装・実行

### Phase 2: Additional Tests

- [ ] 02-contact-list.spec.ts 実装
- [ ] 03-campaign.spec.ts 実装（任意）
- [ ] 04-admin-crud.spec.ts 実装（任意）

### Phase 3: CI/CD

- [ ] GitHub Actions設定
- [ ] Secrets設定（ADMIN_API_KEY）
- [ ] 実行確認

---

## Required Changes to Existing Code

### 1. subscribe.ts - Turnstileスキップ

```typescript
// workers/newsletter/src/routes/subscribe.ts

export async function handleSubscribe(request: Request, env: Env) {
  const { email, turnstileToken } = await request.json();

  // テストモード: test+* メールアドレスはTurnstileスキップ
  const isTestEmail = email.startsWith('test+') && email.endsWith('@edgeshift.tech');

  if (!isTestEmail) {
    const turnstileResult = await verifyTurnstileToken(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
    if (!turnstileResult.success) {
      return jsonResponse({ success: false, error: 'Security verification failed' }, 400);
    }
  }

  // 既存の処理...
}
```

### 2. index.ts - Cronトリガーエンドポイント追加

```typescript
// workers/newsletter/src/index.ts

import { processScheduledCampaigns } from './scheduled';

// 既存のルーティングに追加
else if (path === '/api/admin/trigger-cron' && request.method === 'GET') {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  const result = await processScheduledCampaigns(env);
  return successResponse(result);
}
```

---

## Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "tsx": "^4.7.0"
  }
}
```

---

## Environment Variables

```bash
# .env.local
ADMIN_API_KEY=your-admin-api-key
```

---

## Notes

- **本番環境でのテスト実行**: データ汚染に注意、定期的にクリーンアップ実行
- **Resendメール送信**: テストアカウント宛にメールが実際に送信される
- **D1アクセス**: Wrangler CLI経由、認証済み環境で実行
- **Cron頻度**: 本番は15分毎だが、テストでは手動トリガーで即座に処理

---

*This design document is ready for implementation using git worktree and detailed implementation plan.*
