# Tracking Foundation (Batch 3B) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** クリックイベントとシーケンス配信ログのトラッキング基盤を構築する

**Architecture:** 既存の `delivery_logs` テーブルを拡張してシーケンスメールも統一的に記録。`click_events` テーブルで全クリックを記録。Webhook で `click.link` を受け取り記録。

**Tech Stack:** Cloudflare Workers, D1, TypeScript, Vitest

---

## Task 1: スキーマ変更

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Modify: `workers/newsletter/src/__tests__/setup.ts`

**Step 1: schema.sql に click_events テーブル追加**

`schema.sql` の末尾に追加:

```sql
-- Click events table (全クリック記録)
CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY,
  delivery_log_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_click_events_delivery_log ON click_events(delivery_log_id);
CREATE INDEX IF NOT EXISTS idx_click_events_subscriber ON click_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events(clicked_at);
```

**Step 2: テストセットアップにテーブル追加**

`src/__tests__/setup.ts` の `setupTestDb()` に追加:

```typescript
env.DB.prepare(`CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY,
  delivery_log_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
)`),
```

`cleanupTestDb()` の DELETE 文の先頭に追加:
```typescript
env.DB.prepare('DELETE FROM click_events WHERE 1=1'),
```

**Step 3: delivery_logs テーブルに sequence カラム追加**

`setup.ts` の `delivery_logs` CREATE TABLE を更新:

```typescript
env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  sequence_id TEXT,
  sequence_step_id TEXT,
  subscriber_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  resend_id TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
)`),
```

**Step 4: テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS（既存テストに影響なし）

**Step 5: Commit**

```bash
git add workers/newsletter/schema.sql workers/newsletter/src/__tests__/setup.ts
git commit -m "feat(schema): add click_events table and sequence columns to delivery_logs"
```

---

## Task 2: 型定義の追加

**Files:**
- Modify: `workers/newsletter/src/types.ts`

**Step 1: ClickEvent インターフェース追加**

`types.ts` に追加:

```typescript
export interface ClickEvent {
  id: string;
  delivery_log_id: string;
  subscriber_id: string;
  clicked_url: string;
  clicked_at: number;
  created_at: number;
}
```

**Step 2: DeliveryLog インターフェース更新**

既存の `DeliveryLog` を更新:

```typescript
export interface DeliveryLog {
  id: string;
  campaign_id: string | null;     // null for sequence emails
  sequence_id: string | null;     // null for campaign emails
  sequence_step_id: string | null; // null for campaign emails
  subscriber_id: string;
  email: string;
  status: DeliveryStatus;
  resend_id: string | null;
  sent_at: number | null;
  delivered_at: number | null;
  opened_at: number | null;
  clicked_at: number | null;
  error_message: string | null;
  created_at: number;
}
```

**Step 3: テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 4: Commit**

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add ClickEvent interface and update DeliveryLog for sequences"
```

---

## Task 3: sendEmail 関数を修正して resend_id を返す

**Files:**
- Modify: `workers/newsletter/src/lib/email.ts`

**Step 1: sendEmail の戻り値型を更新**

`email.ts` の `sendEmail` 関数の戻り値を変更:

```typescript
export async function sendEmail(
  apiKey: string,
  from: string,
  options: SendEmailOptions
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetchWithRetry('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    const result: ResendResponse = await response.json();

    if (!response.ok || result.error) {
      console.error('Resend API error:', {
        status: response.status,
        error: result.error,
        to: options.to,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to send email (HTTP ${response.status})`,
      };
    }

    return { success: true, id: result.id };  // id を返す
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Email sending error:', {
      error: errorMessage,
      to: options.to,
    });
    return {
      success: false,
      error: `Email sending error: ${errorMessage}`,
    };
  }
}
```

**Step 2: テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add workers/newsletter/src/lib/email.ts
git commit -m "feat(email): return resend_id from sendEmail function"
```

---

## Task 4: recordClickEvent 関数の実装（TDD）

**Files:**
- Create: `workers/newsletter/src/__tests__/click-events.test.ts`
- Modify: `workers/newsletter/src/lib/delivery.ts`

**Step 1: テストファイル作成**

`src/__tests__/click-events.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { recordClickEvent, getClickEvents } from '../lib/delivery';

describe('click events', () => {
  beforeEach(async () => {
    await setupTestDb();
    const env = getTestEnv();

    // Create test data
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, name, status, unsubscribe_token)
      VALUES ('sub-1', 'test@example.com', 'Test User', 'active', 'unsub-token')
    `).run();

    await env.DB.prepare(`
      INSERT INTO campaigns (id, subject, content, status)
      VALUES ('camp-1', 'Test Subject', '<p>Test Content</p>', 'sent')
    `).run();

    await env.DB.prepare(`
      INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
      VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
    `).run();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('recordClickEvent', () => {
    it('should record a click event', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      const event = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').first();

      expect(event).toBeTruthy();
      expect(event?.subscriber_id).toBe('sub-1');
      expect(event?.clicked_url).toBe('https://example.com/article');
      expect(event?.clicked_at).toBeGreaterThan(0);
    });

    it('should record multiple clicks on same URL', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article',
      });

      const events = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').all();

      expect(events.results).toHaveLength(2);
    });

    it('should record clicks on different URLs', async () => {
      const env = getTestEnv();

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article1',
      });

      await recordClickEvent(env, {
        deliveryLogId: 'log-1',
        subscriberId: 'sub-1',
        clickedUrl: 'https://example.com/article2',
      });

      const events = await env.DB.prepare(
        'SELECT * FROM click_events WHERE delivery_log_id = ?'
      ).bind('log-1').all();

      expect(events.results).toHaveLength(2);
      const urls = events.results?.map((e: { clicked_url: string }) => e.clicked_url);
      expect(urls).toContain('https://example.com/article1');
      expect(urls).toContain('https://example.com/article2');
    });
  });

  describe('getClickEvents', () => {
    beforeEach(async () => {
      const env = getTestEnv();
      const now = Math.floor(Date.now() / 1000);

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
          VALUES ('click-1', 'log-1', 'sub-1', 'https://example.com/a', ?)
        `).bind(now),
        env.DB.prepare(`
          INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
          VALUES ('click-2', 'log-1', 'sub-1', 'https://example.com/b', ?)
        `).bind(now + 10),
      ]);
    });

    it('should get all click events for a delivery log', async () => {
      const env = getTestEnv();

      const events = await getClickEvents(env, 'log-1');

      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent delivery log', async () => {
      const env = getTestEnv();

      const events = await getClickEvents(env, 'non-existent');

      expect(events).toHaveLength(0);
    });
  });
});
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/click-events.test.ts`
Expected: FAIL with "recordClickEvent is not exported"

**Step 3: recordClickEvent 実装**

`src/lib/delivery.ts` に追加:

```typescript
export interface RecordClickEventParams {
  deliveryLogId: string;
  subscriberId: string;
  clickedUrl: string;
}

/**
 * Record a click event
 */
export async function recordClickEvent(
  env: Env,
  params: RecordClickEventParams
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(`
    INSERT INTO click_events (id, delivery_log_id, subscriber_id, clicked_url, clicked_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    params.deliveryLogId,
    params.subscriberId,
    params.clickedUrl,
    now
  ).run();
}

/**
 * Get click events for a delivery log
 */
export async function getClickEvents(
  env: Env,
  deliveryLogId: string
): Promise<ClickEvent[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM click_events
    WHERE delivery_log_id = ?
    ORDER BY clicked_at ASC
  `).bind(deliveryLogId).all<ClickEvent>();

  return result.results || [];
}
```

`delivery.ts` の import に `ClickEvent` を追加:

```typescript
import type { Env, DeliveryLog, DeliveryStatus, ClickEvent } from '../types';
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/click-events.test.ts`
Expected: PASS

**Step 5: 全テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/__tests__/click-events.test.ts workers/newsletter/src/lib/delivery.ts
git commit -m "feat(delivery): add recordClickEvent and getClickEvents functions"
```

---

## Task 5: recordSequenceDeliveryLog 関数の実装（TDD）

**Files:**
- Modify: `workers/newsletter/src/__tests__/delivery.test.ts`
- Modify: `workers/newsletter/src/lib/delivery.ts`

**Step 1: テスト追加**

`src/__tests__/delivery.test.ts` に追加:

```typescript
describe('recordSequenceDeliveryLog', () => {
  beforeEach(async () => {
    const env = getTestEnv();

    await env.DB.prepare(`
      INSERT INTO sequences (id, name, is_active)
      VALUES ('seq-1', 'Welcome Sequence', 1)
    `).run();

    await env.DB.prepare(`
      INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, subject, content)
      VALUES ('step-1', 'seq-1', 1, 0, 'Welcome!', '<p>Welcome content</p>')
    `).run();
  });

  it('should record a sequence delivery log', async () => {
    const env = getTestEnv();

    await recordSequenceDeliveryLog(env, {
      sequenceId: 'seq-1',
      sequenceStepId: 'step-1',
      subscriberId: 'sub-1',
      email: 'test@example.com',
      resendId: 'resend-seq-123',
    });

    const log = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ? AND sequence_step_id = ?'
    ).bind('seq-1', 'step-1').first();

    expect(log).toBeTruthy();
    expect(log?.campaign_id).toBeNull();
    expect(log?.sequence_id).toBe('seq-1');
    expect(log?.sequence_step_id).toBe('step-1');
    expect(log?.subscriber_id).toBe('sub-1');
    expect(log?.email).toBe('test@example.com');
    expect(log?.resend_id).toBe('resend-seq-123');
    expect(log?.status).toBe('sent');
    expect(log?.sent_at).toBeGreaterThan(0);
  });

  it('should record a failed sequence delivery log', async () => {
    const env = getTestEnv();

    await recordSequenceDeliveryLog(env, {
      sequenceId: 'seq-1',
      sequenceStepId: 'step-1',
      subscriberId: 'sub-1',
      email: 'test@example.com',
      status: 'failed',
      errorMessage: 'Email send failed',
    });

    const log = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ?'
    ).bind('seq-1').first();

    expect(log?.status).toBe('failed');
    expect(log?.error_message).toBe('Email send failed');
    expect(log?.resend_id).toBeNull();
  });
});
```

import 文に `recordSequenceDeliveryLog` を追加:

```typescript
import { recordDeliveryLog, updateDeliveryStatus, getDeliveryLogs, findDeliveryLogByResendId, recordSequenceDeliveryLog } from '../lib/delivery';
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/delivery.test.ts`
Expected: FAIL with "recordSequenceDeliveryLog is not exported"

**Step 3: recordSequenceDeliveryLog 実装**

`src/lib/delivery.ts` に追加:

```typescript
export interface RecordSequenceDeliveryLogParams {
  sequenceId: string;
  sequenceStepId: string;
  subscriberId: string;
  email: string;
  resendId?: string;
  status?: DeliveryStatus;
  errorMessage?: string;
}

/**
 * Record a sequence delivery log entry
 */
export async function recordSequenceDeliveryLog(
  env: Env,
  params: RecordSequenceDeliveryLogParams
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const status = params.status || 'sent';

  await env.DB.prepare(`
    INSERT INTO delivery_logs (
      id, campaign_id, sequence_id, sequence_step_id, subscriber_id, email, status, resend_id, sent_at, error_message
    )
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.sequenceId,
    params.sequenceStepId,
    params.subscriberId,
    params.email,
    status,
    params.resendId || null,
    status === 'sent' || status === 'delivered' ? now : null,
    params.errorMessage || null
  ).run();
}
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/delivery.test.ts`
Expected: PASS

**Step 5: 全テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/__tests__/delivery.test.ts workers/newsletter/src/lib/delivery.ts
git commit -m "feat(delivery): add recordSequenceDeliveryLog function"
```

---

## Task 6: Webhook で click.link を記録

**Files:**
- Modify: `workers/newsletter/src/routes/webhook.ts`
- Modify: `workers/newsletter/src/__tests__/webhook.test.ts`

**Step 1: テスト追加**

`src/__tests__/webhook.test.ts` に追加（既存の describe 内）:

```typescript
it('should record click event when email.clicked with link', async () => {
  const env = getTestEnv();

  // Setup: create delivery log
  await env.DB.prepare(`
    INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
    VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
  `).run();

  const event = {
    type: 'email.clicked',
    created_at: new Date().toISOString(),
    data: {
      email_id: 'resend-123',
      from: 'test@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      created_at: new Date().toISOString(),
      click: {
        link: 'https://example.com/clicked-link',
        timestamp: new Date().toISOString(),
      },
    },
  };

  const request = createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
  const response = await handleResendWebhook(request, env);

  expect(response.status).toBe(200);

  // Verify click event was recorded
  const clickEvent = await env.DB.prepare(
    'SELECT * FROM click_events WHERE delivery_log_id = ?'
  ).bind('log-1').first();

  expect(clickEvent).toBeTruthy();
  expect(clickEvent?.clicked_url).toBe('https://example.com/clicked-link');
  expect(clickEvent?.subscriber_id).toBe('sub-1');
});

it('should still update status even if click.link is missing', async () => {
  const env = getTestEnv();

  // Setup
  await env.DB.prepare(`
    INSERT INTO delivery_logs (id, campaign_id, subscriber_id, email, status, resend_id)
    VALUES ('log-1', 'camp-1', 'sub-1', 'test@example.com', 'sent', 'resend-123')
  `).run();

  const event = {
    type: 'email.clicked',
    created_at: new Date().toISOString(),
    data: {
      email_id: 'resend-123',
      from: 'test@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      created_at: new Date().toISOString(),
      // No click.link
    },
  };

  const request = createSignedWebhookRequest(event, env.RESEND_WEBHOOK_SECRET);
  const response = await handleResendWebhook(request, env);

  expect(response.status).toBe(200);

  // Status should still be updated
  const log = await env.DB.prepare(
    'SELECT * FROM delivery_logs WHERE id = ?'
  ).bind('log-1').first();

  expect(log?.status).toBe('clicked');
});
```

**Step 2: テスト実行（失敗確認）**

Run: `cd workers/newsletter && npm test src/__tests__/webhook.test.ts`
Expected: FAIL (click_events not recorded)

**Step 3: webhook.ts 更新**

`src/routes/webhook.ts` を更新:

import に追加:
```typescript
import { findDeliveryLogByResendId, updateDeliveryStatus, recordClickEvent } from '../lib/delivery';
```

`case 'email.clicked':` を更新:
```typescript
case 'email.clicked':
  newStatus = 'clicked';
  // Record click event if link is present
  if (event.data.click?.link) {
    try {
      await recordClickEvent(env, {
        deliveryLogId: deliveryLog.id,
        subscriberId: deliveryLog.subscriber_id,
        clickedUrl: event.data.click.link,
      });
      console.log(`Recorded click event for ${deliveryLog.id}: ${event.data.click.link}`);
    } catch (error) {
      // Log error but don't fail the webhook
      console.error('Failed to record click event:', error);
    }
  }
  break;
```

**Step 4: テスト実行（成功確認）**

Run: `cd workers/newsletter && npm test src/__tests__/webhook.test.ts`
Expected: PASS

**Step 5: 全テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 6: Commit**

```bash
git add workers/newsletter/src/routes/webhook.ts workers/newsletter/src/__tests__/webhook.test.ts
git commit -m "feat(webhook): record click events with URL from email.clicked"
```

---

## Task 7: シーケンス送信時のログ記録

**Files:**
- Modify: `workers/newsletter/src/lib/sequence-processor.ts`
- Modify: `workers/newsletter/src/__tests__/sequence-processor.test.ts`

**Step 1: テスト追加**

`src/__tests__/sequence-processor.test.ts` に追加:

```typescript
describe('sequence delivery logging', () => {
  it('should record delivery log when sending sequence email', async () => {
    const env = getTestEnv();
    const now = Math.floor(Date.now() / 1000);

    // Setup: subscriber enrolled in sequence with step due
    await env.DB.prepare(`
      INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, current_step, started_at)
      VALUES ('ss-1', 'sub-1', 'seq-1', 0, ?)
    `).bind(now - 100).run();  // started 100 seconds ago

    // Mock sendEmail to return resend_id
    // Note: This test verifies the log is created, actual email sending is mocked

    await processSequenceEmails(env);

    // Verify delivery log was created
    const log = await env.DB.prepare(
      'SELECT * FROM delivery_logs WHERE sequence_id = ? AND sequence_step_id = ?'
    ).bind('seq-1', 'step-1').first();

    expect(log).toBeTruthy();
    expect(log?.subscriber_id).toBe('sub-1');
    expect(log?.email).toBe('test@example.com');
    expect(log?.status).toBe('sent');
    expect(log?.sequence_id).toBe('seq-1');
    expect(log?.sequence_step_id).toBe('step-1');
  });
});
```

**Step 2: sequence-processor.ts 更新**

`src/lib/sequence-processor.ts` の import 更新:

```typescript
import type { Env } from '../types';
import { sendEmail } from './email';
import { recordSequenceDeliveryLog } from './delivery';
```

`PendingSequenceEmail` インターフェースに `step_id` 追加:

```typescript
interface PendingSequenceEmail {
  subscriber_sequence_id: string;
  subscriber_id: string;
  email: string;
  name: string | null;
  unsubscribe_token: string;
  subject: string;
  content: string;
  step_number: number;
  step_id: string;  // 追加
  sequence_id: string;
  current_step: number;
  started_at: number;
}
```

SQL クエリを更新（`step.id as step_id` を追加）:

```typescript
const pendingEmails = await env.DB.prepare(`
  SELECT
    ss.id as subscriber_sequence_id,
    ss.subscriber_id,
    ss.current_step,
    ss.started_at,
    s.email,
    s.name,
    s.unsubscribe_token,
    step.id as step_id,
    step.subject,
    step.content,
    step.step_number,
    step.sequence_id
  FROM subscriber_sequences ss
  JOIN subscribers s ON s.id = ss.subscriber_id
  JOIN sequences seq ON seq.id = ss.sequence_id
  JOIN sequence_steps step ON step.sequence_id = ss.sequence_id
  WHERE ss.completed_at IS NULL
  AND s.status = 'active'
  AND seq.is_active = 1
  AND step.step_number = ss.current_step + 1
  AND (ss.started_at + step.delay_days * 86400) <= ?
`).bind(now).all<PendingSequenceEmail>();
```

メール送信後のログ記録を追加:

```typescript
if (result.success) {
  // Record delivery log
  try {
    await recordSequenceDeliveryLog(env, {
      sequenceId: email.sequence_id,
      sequenceStepId: email.step_id,
      subscriberId: email.subscriber_id,
      email: email.email,
      resendId: result.id,
    });
  } catch (logError) {
    console.error('Failed to record sequence delivery log:', logError);
    // Continue - email was sent successfully
  }

  // Check if this is the last step
  // ... (existing code)
}
```

失敗時のログ記録も追加:

```typescript
} else {
  // Record failed delivery log
  try {
    await recordSequenceDeliveryLog(env, {
      sequenceId: email.sequence_id,
      sequenceStepId: email.step_id,
      subscriberId: email.subscriber_id,
      email: email.email,
      status: 'failed',
      errorMessage: result.error,
    });
  } catch (logError) {
    console.error('Failed to record sequence delivery log:', logError);
  }
  console.error(`Failed to send sequence email to ${email.email}:`, result.error);
}
```

**Step 3: テスト実行**

Run: `cd workers/newsletter && npm test src/__tests__/sequence-processor.test.ts`
Expected: PASS

**Step 4: 全テスト実行**

Run: `cd workers/newsletter && npm test`
Expected: 全テスト PASS

**Step 5: Commit**

```bash
git add workers/newsletter/src/lib/sequence-processor.ts workers/newsletter/src/__tests__/sequence-processor.test.ts
git commit -m "feat(sequence): record delivery logs when sending sequence emails"
```

---

## Task 8: 本番 DB マイグレーション

**Step 1: ローカル D1 にマイグレーション適用**

```bash
cd workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --local --command "ALTER TABLE delivery_logs ADD COLUMN sequence_id TEXT"
npx wrangler d1 execute edgeshift-newsletter --local --command "ALTER TABLE delivery_logs ADD COLUMN sequence_step_id TEXT"
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence ON delivery_logs(sequence_id)"
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence_step ON delivery_logs(sequence_step_id)"
```

```bash
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE TABLE IF NOT EXISTS click_events (id TEXT PRIMARY KEY, delivery_log_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, clicked_url TEXT NOT NULL, clicked_at INTEGER NOT NULL, created_at INTEGER DEFAULT (unixepoch()), FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id), FOREIGN KEY (subscriber_id) REFERENCES subscribers(id))"
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE INDEX IF NOT EXISTS idx_click_events_delivery_log ON click_events(delivery_log_id)"
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE INDEX IF NOT EXISTS idx_click_events_subscriber ON click_events(subscriber_id)"
npx wrangler d1 execute edgeshift-newsletter --local --command "CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events(clicked_at)"
```

**Step 2: 本番 D1 にマイグレーション適用**

```bash
npx wrangler d1 execute edgeshift-newsletter --remote --command "ALTER TABLE delivery_logs ADD COLUMN sequence_id TEXT"
npx wrangler d1 execute edgeshift-newsletter --remote --command "ALTER TABLE delivery_logs ADD COLUMN sequence_step_id TEXT"
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence ON delivery_logs(sequence_id)"
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence_step ON delivery_logs(sequence_step_id)"
```

```bash
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE TABLE IF NOT EXISTS click_events (id TEXT PRIMARY KEY, delivery_log_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, clicked_url TEXT NOT NULL, clicked_at INTEGER NOT NULL, created_at INTEGER DEFAULT (unixepoch()), FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id), FOREIGN KEY (subscriber_id) REFERENCES subscribers(id))"
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE INDEX IF NOT EXISTS idx_click_events_delivery_log ON click_events(delivery_log_id)"
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE INDEX IF NOT EXISTS idx_click_events_subscriber ON click_events(subscriber_id)"
npx wrangler d1 execute edgeshift-newsletter --remote --command "CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events(clicked_at)"
```

**Step 3: Worker デプロイ**

```bash
cd workers/newsletter
npm run deploy
```

**Step 4: Commit**

```bash
git commit --allow-empty -m "chore: apply DB migration to production (delivery_logs + click_events)"
```

---

## Summary

| Task | Description | Files |
|:--|:--|:--|
| 1 | スキーマ変更 | schema.sql, setup.ts |
| 2 | 型定義追加 | types.ts |
| 3 | sendEmail 修正 | email.ts |
| 4 | recordClickEvent 実装 | delivery.ts, click-events.test.ts |
| 5 | recordSequenceDeliveryLog 実装 | delivery.ts, delivery.test.ts |
| 6 | Webhook click.link 記録 | webhook.ts, webhook.test.ts |
| 7 | シーケンスログ記録 | sequence-processor.ts, sequence-processor.test.ts |
| 8 | 本番 DB マイグレーション | (wrangler commands) |

**Total: 8 tasks**

---

*Created: 2024-12-24*
