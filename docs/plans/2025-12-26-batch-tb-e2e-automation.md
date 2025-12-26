# Batch TB E2Eテスト修正計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目標:** E2Eテストを真のUI操作ベースに修正。自動化できない操作はユーザーに指示して待機する。

**アーキテクチャ:** Playwright の `page.pause()` を使用し、ユーザー操作が必要な箇所で明確な指示を表示して待機。D1は検証（SELECT）のみに使用し、データ操作（INSERT/UPDATE/DELETE）は禁止。

**技術スタック:** Playwright, TypeScript, page.pause()

---

## 前提条件

- 環境変数設定済み:
  - `TEST_USER_EMAIL`: テストメール受信用アドレス
  - `ADMIN_API_KEY`: 管理画面認証キー
- テスト実行時は `--headed` モードで実行（ユーザー操作のため）

---

## Task 1: Turnstile部分の修正

**ファイル:**
- 修正: `tests/e2e/specs/02-batch-tb-automated.spec.ts:233-241`

**現在の問題コード:**
```typescript
// BAD: Turnstileの自動クリックは動作しない
const turnstileFrame = page.frameLocator('iframe[src*="turnstile"]');
await turnstileFrame.locator('input[type="checkbox"]').click({ timeout: 10000 });
```

**Step 1: Turnstile部分を修正**

以下のコードに置き換える:

```typescript
// Turnstileはユーザーが手動で完了する必要がある
console.log(`
========================================
ACTION REQUIRED: Turnstileを完了してください

1. ブラウザでTurnstileチェックボックスをクリック
2. 認証が完了したらPlaywright Inspectorで「Resume」をクリック
========================================
`);
await page.pause();
```

**Step 2: テスト実行して動作確認**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/tests/e2e
npx playwright test specs/02-batch-tb-automated.spec.ts -g "Signup with real email" --headed
```

期待結果: Turnstile画面でpauseし、手動完了後に続行

**Step 3: コミット**

```bash
git add tests/e2e/specs/02-batch-tb-automated.spec.ts
git commit -m "fix(e2e): use page.pause() for Turnstile manual completion"
```

---

## Task 2: コンタクトリストメンバー追加の修正

**ファイル:**
- 修正: `tests/e2e/specs/02-batch-tb-automated.spec.ts:407-428`

**現在の問題コード:**
```typescript
// BAD: D1直接INSERTはE2Eテストではない
const memberId = crypto.randomUUID();
await queryD1(
  `INSERT INTO contact_list_members (id, contact_list_id, subscriber_id, added_at) VALUES ('${memberId}', '${listId}', '${subscriberId}', datetime('now'))`
);
```

**Step 1: D1直接INSERTを削除し、ユーザー操作待機に変更**

以下のコードに置き換える:

```typescript
// コンタクトリストメンバー追加はUIで手動実行
console.log(`
========================================
ACTION REQUIRED: コンタクトリストにメンバーを追加してください

1. 作成したコンタクトリスト詳細画面を開く
2. 「メンバー追加」機能でアクティブな購読者を追加
   （UIがない場合は管理画面から直接追加）
3. 追加完了後、Playwright Inspectorで「Resume」をクリック

コンタクトリストID: ${listId}
========================================
`);
await page.pause();

// D1で追加されたことを検証（検証のみ、操作はしない）
const members = await queryD1<{ count: number }>(
  `SELECT COUNT(*) as count FROM contact_list_members WHERE contact_list_id = '${listId}'`
);
expect(members[0].count).toBeGreaterThanOrEqual(1);
console.log(`コンタクトリストのメンバー数: ${members[0].count}`);
```

**Step 2: テスト実行して動作確認**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/tests/e2e
npx playwright test specs/02-batch-tb-automated.spec.ts -g "TB-3-2" --headed
```

期待結果: メンバー追加指示でpauseし、手動追加後に検証が通る

**Step 3: コミット**

```bash
git add tests/e2e/specs/02-batch-tb-automated.spec.ts
git commit -m "fix(e2e): use page.pause() for contact list member addition"
```

---

## Task 3: メール確認待機の追加

**ファイル:**
- 修正: `tests/e2e/specs/02-batch-tb-automated.spec.ts:253-262`

**現在の問題:**
サインアップ後のメール確認がconsole.logのみで、テストが続行してしまう。

**Step 1: メール確認でpause追加**

サインアップ成功後に以下を追加:

```typescript
console.log(`
========================================
ACTION REQUIRED: メールを確認してください

1. ${testEmail} 宛の確認メールを開く
2. 確認リンクをクリック
3. 確認完了後、Playwright Inspectorで「Resume」をクリック
========================================
`);
await page.pause();

// 確認後、subscriberがactiveになったことを検証
const confirmedSubscriber = await getSubscriber(testEmail);
expect(confirmedSubscriber).toBeTruthy();
expect(confirmedSubscriber!.status).toBe('active');
console.log('購読者ステータス確認: active');
```

**Step 2: テスト実行して動作確認**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/tests/e2e
npx playwright test specs/02-batch-tb-automated.spec.ts -g "Signup with real email" --headed
```

**Step 3: コミット**

```bash
git add tests/e2e/specs/02-batch-tb-automated.spec.ts
git commit -m "fix(e2e): add page.pause() for email confirmation wait"
```

---

## Task 4: 配信確認テストの統合

**ファイル:**
- 修正: `tests/e2e/specs/02-batch-tb-automated.spec.ts:264-297`

**現在の問題:**
`TB-2-1: Verify delivery logs after confirmation` テストが分離しており、メール確認前に実行されるとスキップされる。

**Step 1: サインアップテストに配信確認を統合**

`TB-2-1: Signup with real email` テストの最後に配信確認を追加:

```typescript
// シーケンス配信を待機（cronは15分ごと）
console.log(`
========================================
ACTION REQUIRED: シーケンス配信を待ってください

1. cronジョブが実行されるまで待機（最大15分）
2. ${testEmail} にシーケンスメールが届いたら確認
3. 確認後、Playwright Inspectorで「Resume」をクリック

※ 時間がかかる場合はスキップしてOK
========================================
`);
await page.pause();

// 配信ログを検証
const logs = await getDeliveryLogs(testEmail);
const sequenceLogs = logs.filter(log => log.sequence_id !== null);
console.log(`シーケンス配信ログ数: ${sequenceLogs.length}`);
if (sequenceLogs.length > 0) {
  console.log('配信されたメール:', sequenceLogs.map(l => l.email_subject));
}
```

**Step 2: 分離していた配信確認テストを削除**

`TB-2-1: Verify delivery logs after confirmation` テストを削除（統合したため不要）

**Step 3: テスト実行して動作確認**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/tests/e2e
npx playwright test specs/02-batch-tb-automated.spec.ts -g "TB-2-1" --headed
```

**Step 4: コミット**

```bash
git add tests/e2e/specs/02-batch-tb-automated.spec.ts
git commit -m "fix(e2e): integrate delivery verification into signup test"
```

---

## Task 5: 全テスト実行と最終確認

**Step 1: 全テストを実行**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/tests/e2e
npx playwright test specs/02-batch-tb-automated.spec.ts --headed
```

**Step 2: 各pause箇所でユーザー操作を実行**

1. Admin login - 自動（pauseなし）
2. Sequence creation - 自動（pauseなし）
3. Signup page connection - 自動（pauseなし）
4. Signup - Turnstileで pause → 手動完了 → Resume
5. Email confirmation - pause → メール確認 → Resume
6. Delivery verification - pause → 配信確認 → Resume（スキップ可）
7. Campaign creation - 自動（pauseなし）
8. Contact list - メンバー追加で pause → 手動追加 → Resume

**Step 3: 最終コミット**

```bash
git add tests/e2e/specs/02-batch-tb-automated.spec.ts
git commit -m "feat(e2e): complete batch-tb E2E test with user interaction pauses"
```

---

## サマリー

| Task | 内容 | 変更箇所 |
|------|------|----------|
| 1 | Turnstile修正 | 233-241行目 |
| 2 | コンタクトリストメンバー追加修正 | 407-428行目 |
| 3 | メール確認待機追加 | 253-262行目 |
| 4 | 配信確認テスト統合 | 264-297行目 |
| 5 | 全テスト実行 | - |

**重要原則:**
- D1は検証（SELECT）のみ
- データ操作はすべてUI経由
- 自動化できない操作は `page.pause()` で待機
- テスト実行は必ず `--headed` モード
