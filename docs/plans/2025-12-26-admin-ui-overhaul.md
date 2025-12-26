# 管理画面改修計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**目標:** 管理画面のナビゲーション整理、名称変更、機能追加を行い、ユーザビリティを向上させる。

**アーキテクチャ:** AdminLayout.astroでナビ構造を変更、React componentsで機能追加、Worker APIで購読者編集とシーケンス1通目の分単位設定をサポート。

**技術スタック:** Astro, React, TypeScript, Cloudflare Workers, D1

**確認方式:** 各Task完了後に `npm run dev` でローカル起動し、ユーザーが動作確認。確認OKでコミット。

---

## 前提条件

- worktree: `/Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan`
- ブランチ: `batch-tb-test-plan`

---

## Task 1: ナビゲーション変更

**ファイル:**
- 修正: `src/layouts/AdminLayout.astro:28-55`

**変更内容:**
- 「キャンペーン」→「ニュースレター」に変更
- 「購読者」リンクを削除
- 「コンタクトリスト」リンクを追加
- 「サインアップページ」リンクを追加
- 「分析」の絵文字を削除

**Step 1: AdminLayout.astroのナビを修正**

`src/layouts/AdminLayout.astro:28-55` を以下に置き換え:

```astro
<nav class="p-4">
  <ul class="space-y-2">
    <li>
      <a href="/admin" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        ダッシュボード
      </a>
    </li>
    <li>
      <a href="/admin/campaigns" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        ニュースレター
      </a>
    </li>
    <li>
      <a href="/admin/sequences" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        シーケンス
      </a>
    </li>
    <li>
      <a href="/admin/contact-lists" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        コンタクトリスト
      </a>
    </li>
    <li>
      <a href="/admin/signup-pages" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        サインアップページ
      </a>
    </li>
    <li>
      <a href="/admin/analytics" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
        分析
      </a>
    </li>
  </ul>
</nav>
```

**Step 2: ローカル起動**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan
npm run dev
```

**🔍 ユーザー確認ポイント:**

ブラウザで http://localhost:4321/admin を開いて確認:

- [ ] サイドバーに「ニュースレター」が表示される
- [ ] サイドバーに「コンタクトリスト」が表示される
- [ ] サイドバーに「サインアップページ」が表示される
- [ ] 「購読者」リンクがなくなっている
- [ ] 各リンクをクリックして遷移できる

**Step 3: 確認OKならコミット**

```bash
git add src/layouts/AdminLayout.astro
git commit -m "refactor(admin): update navigation - rename Campaign to Newsletter, add Contact Lists and Signup Pages"
```

---

## Task 2: キャンペーン→ニュースレター 名称変更

**ファイル:**
- 修正: `src/pages/admin/campaigns/index.astro`
- 修正: `src/pages/admin/campaigns/new.astro`
- 修正: `src/pages/admin/campaigns/edit.astro`
- 修正: `src/pages/admin/campaigns/detail.astro`
- 修正: `src/components/admin/CampaignList.tsx`
- 修正: `src/components/admin/Dashboard.tsx:77-86`

**Step 1: campaigns/index.astro**

タイトルとh1を変更:
- `title="キャンペーン管理"` → `title="ニュースレター"`
- `<h1>` 内の「キャンペーン」→「ニュースレター」

**Step 2: campaigns/new.astro**

- `title="新規キャンペーン"` → `title="新規ニュースレター"`
- h1も同様に変更

**Step 3: campaigns/edit.astro**

- `title="キャンペーン編集"` → `title="ニュースレター編集"`

**Step 4: campaigns/detail.astro**

- `title="キャンペーン詳細"` → `title="ニュースレター詳細"`

**Step 5: CampaignList.tsx**

- 「新規キャンペーン」→「新規作成」
- 「キャンペーンがまだありません」→「ニュースレターがまだありません」

**Step 6: Dashboard.tsx:77-86**

セクションタイトルを変更:
```tsx
<h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">ニュースレター</h2>
```

KPICardのラベルも変更:
- 「総キャンペーン」→「総配信数」

**🔍 ユーザー確認ポイント:**

```bash
npm run dev
```

ブラウザで確認:
- [ ] `/admin` - ダッシュボードに「ニュースレター」セクションが表示
- [ ] `/admin/campaigns` - ページタイトルが「ニュースレター」
- [ ] 「新規作成」ボタンが表示される
- [ ] `/admin/campaigns/new` - タイトルが「新規ニュースレター」

**Step 7: 確認OKならコミット**

```bash
git add src/pages/admin/campaigns/ src/components/admin/CampaignList.tsx src/components/admin/Dashboard.tsx
git commit -m "refactor(admin): rename Campaign to Newsletter in all UI labels"
```

---

## Task 3: ダッシュボードにシーケンス統計追加

**ファイル:**
- 修正: `src/components/admin/Dashboard.tsx`
- 修正: `workers/newsletter/src/routes/tracking.ts`

**Step 1: Dashboard.tsx - interface拡張**

```tsx
interface DashboardStats {
  subscribers: { total: number; active: number; pending: number; unsubscribed: number };
  campaigns: { total: number; draft: number; scheduled: number; sent: number };
  sequences: { total: number; active: number; totalEnrolled: number; completed: number };
  delivery: { total: number; delivered: number; opened: number; clicked: number; openRate: number; clickRate: number };
}
```

**Step 2: Dashboard.tsx - シーケンスセクション追加**

「ニュースレター」セクションの後、「配信パフォーマンス」の前に追加:

```tsx
{/* Sequence Stats */}
{stats.sequences && (
  <section>
    <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">シーケンス</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="総シーケンス" value={stats.sequences.total} />
      <KPICard title="アクティブ" value={stats.sequences.active} color="success" />
      <KPICard title="総登録者" value={stats.sequences.totalEnrolled} />
      <KPICard title="完了者" value={stats.sequences.completed} color="success" />
    </div>
  </section>
)}
```

**Step 3: tracking.ts - getDashboardStats関数修正**

シーケンス統計のクエリを追加:

```typescript
// Sequence stats
const sequenceStats = await env.DB.prepare(`
  SELECT
    (SELECT COUNT(*) FROM sequences) as total,
    (SELECT COUNT(*) FROM sequences WHERE is_active = 1) as active,
    (SELECT COUNT(*) FROM subscriber_sequences) as total_enrolled,
    (SELECT COUNT(*) FROM subscriber_sequences WHERE completed_at IS NOT NULL) as completed
`).first();
```

レスポンスに追加:

```typescript
return successResponse({
  subscribers: { ... },
  campaigns: { ... },
  sequences: {
    total: Number(sequenceStats?.total) || 0,
    active: Number(sequenceStats?.active) || 0,
    totalEnrolled: Number(sequenceStats?.total_enrolled) || 0,
    completed: Number(sequenceStats?.completed) || 0,
  },
  delivery: { ... },
});
```

**Step 4: ローカルWorker起動**

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/workers/newsletter
npm run dev
```

別ターミナルで:

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan
npm run dev
```

**🔍 ユーザー確認ポイント:**

ブラウザで http://localhost:4321/admin を開いて確認:

- [ ] ダッシュボードに「シーケンス」セクションが表示される
- [ ] 「総シーケンス」「アクティブ」「総登録者」「完了者」の4つのKPIカードがある
- [ ] 数値が正しく表示される（0でもOK）

**Step 5: 確認OKならコミット**

```bash
git add src/components/admin/Dashboard.tsx workers/newsletter/src/routes/tracking.ts
git commit -m "feat(dashboard): add sequence statistics section"
```

---

## Task 4: 購読者ページ削除とContact List統合

**ファイル:**
- 削除: `src/pages/admin/subscribers/index.astro`
- 修正: `src/components/admin/ContactListList.tsx`
- 修正: `src/components/admin/ContactListDetail.tsx`
- 修正: `src/utils/admin-api.ts`
- 追加: `workers/newsletter/src/routes/subscribers.ts` に updateSubscriber
- 修正: `workers/newsletter/src/index.ts` にルート追加

### Step 1: 購読者ページを削除

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan
rm src/pages/admin/subscribers/index.astro
rmdir src/pages/admin/subscribers
```

### Step 2: ContactListList.tsx に「全購読者」追加

リスト一覧の先頭（listsのmap前）に追加:

```tsx
{/* All Subscribers - special link */}
<a
  href="/admin/contact-lists/detail?id=all"
  className="block bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200 hover:border-blue-400 transition-colors mb-6"
>
  <div className="flex items-center justify-between">
    <div>
      <h3 className="font-semibold text-blue-900">📋 全購読者</h3>
      <p className="text-sm text-blue-700">すべての購読者を表示・編集</p>
    </div>
    <span className="text-blue-400">→</span>
  </div>
</a>
```

### Step 3: admin-api.ts に updateSubscriber 追加

```typescript
export async function updateSubscriber(
  id: string,
  data: { name?: string; status?: string }
): Promise<ApiResult<{ subscriber: Subscriber }>> {
  return apiRequest(`/api/subscribers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
```

### Step 4: Worker側 - subscribers.ts に updateSubscriber 追加

ファイル末尾に追加:

```typescript
export async function updateSubscriber(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(id).first();

    if (!existing) {
      return errorResponse('Subscriber not found', 404);
    }

    const body = await request.json<{ name?: string; status?: string }>();
    const updates: string[] = [];
    const bindings: (string | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      bindings.push(body.name || null);
    }
    if (body.status !== undefined) {
      if (!['active', 'pending', 'unsubscribed'].includes(body.status)) {
        return errorResponse('Invalid status. Must be active, pending, or unsubscribed', 400);
      }
      updates.push('status = ?');
      bindings.push(body.status);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    bindings.push(id);
    await env.DB.prepare(
      `UPDATE subscribers SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    const subscriber = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE id = ?'
    ).bind(id).first();

    return successResponse({ subscriber });
  } catch (error) {
    console.error('Update subscriber error:', error);
    return errorResponse('Internal server error', 500);
  }
}
```

### Step 5: index.ts にルート追加

`/api/subscribers` 関連のルート処理部分に追加:

```typescript
// PUT /api/subscribers/:id - Update subscriber
if (path.match(/^\/api\/subscribers\/[^\/]+$/) && request.method === 'PUT') {
  const id = path.split('/')[3];
  const { updateSubscriber } = await import('./routes/subscribers');
  return updateSubscriber(request, env, id);
}
```

### Step 6: ContactListDetail.tsx 大幅修正

1. `listSubscribers` と `updateSubscriber` をインポート
2. `listId === 'all'` の場合の特殊処理
3. 編集モーダル追加

（詳細コードは長いため実装時に提供）

**🔍 ユーザー確認ポイント:**

ローカルWorkerとAstro両方起動:

```bash
# Terminal 1
cd workers/newsletter && npm run dev

# Terminal 2
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan && npm run dev
```

ブラウザで確認:
- [ ] `/admin/contact-lists` - 先頭に「全購読者」カードが表示される
- [ ] 「全購読者」をクリック → `/admin/contact-lists/detail?id=all` に遷移
- [ ] 全購読者一覧が表示される
- [ ] 各購読者の「編集」ボタンが機能する
- [ ] 名前・ステータスを変更して保存できる
- [ ] 通常のコンタクトリスト詳細も引き続き動作する

**Step 7: 確認OKならコミット**

```bash
git add -A
git commit -m "feat(admin): integrate subscribers into contact lists with edit functionality"
```

---

## Task 5: シーケンス詳細でdelay_time表示

**ファイル:**
- 修正: `src/components/admin/SequenceDetail.tsx`

**Step 1: SequenceStep interface 修正 (7-11行目)**

```tsx
interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}
```

**Step 2: ステップ別分析テーブルに列追加**

テーブルヘッダー（206行目付近）に追加:

```tsx
<th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
  配信タイミング
</th>
```

テーブルボディ（226行目付近、step_numberの後）に追加:

```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
  {sequence.steps && sequence.steps[step.step_number - 1] ? (
    <>
      {sequence.steps[step.step_number - 1].delay_days === 0
        ? '登録直後'
        : `${sequence.steps[step.step_number - 1].delay_days}日後`}
      {sequence.steps[step.step_number - 1].delay_time && (
        <span className="text-[var(--color-text-muted)] ml-1">
          @ {sequence.steps[step.step_number - 1].delay_time}
        </span>
      )}
    </>
  ) : '-'}
</td>
```

**🔍 ユーザー確認ポイント:**

```bash
npm run dev
```

ブラウザで確認:
- [ ] `/admin/sequences` でシーケンス一覧表示
- [ ] 任意のシーケンスの詳細を開く
- [ ] 「ステップ別分析」テーブルに「配信タイミング」列がある
- [ ] 各ステップに「0日後」「1日後」などと時刻が表示される

**Step 3: 確認OKならコミット**

```bash
git add src/components/admin/SequenceDetail.tsx
git commit -m "feat(sequences): display delivery timing in detail view"
```

---

## Task 6: シーケンス1通目の分単位設定

**ファイル:**
- 修正: `workers/newsletter/schema.sql`
- 修正: `workers/newsletter/src/types.ts`
- 修正: `workers/newsletter/src/routes/sequences.ts`
- 修正: `workers/newsletter/src/lib/sequence-processor.ts`
- 修正: `src/components/admin/SequenceStepEditor.tsx`
- 修正: `src/components/admin/SequenceForm.tsx`

### Step 1: D1にカラム追加

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --local --command="ALTER TABLE sequence_steps ADD COLUMN delay_minutes INTEGER DEFAULT NULL"
```

schema.sql にもコメント追加:

```sql
-- sequence_steps table にて delay_minutes カラム追加済み (1通目専用)
```

### Step 2: types.ts 修正

SequenceStep interface:

```typescript
export interface SequenceStep {
  id?: string;
  sequence_id?: string;
  step_number?: number;
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number | null;  // 1通目のみ: 登録から何分後
  subject: string;
  content: string;
  is_enabled?: number;
}
```

### Step 3: sequences.ts 修正

createSequence と updateSequence で delay_minutes を処理:

```typescript
// INSERT文に delay_minutes 追加 (step_number === 1 の時のみ値を入れる)
await env.DB.prepare(`
  INSERT INTO sequence_steps (id, sequence_id, step_number, delay_days, delay_time, delay_minutes, subject, content)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  stepId, sequenceId, i + 1,
  step.delay_days,
  step.delay_time || null,
  i === 0 ? (step.delay_minutes ?? null) : null,
  step.subject, step.content
).run();
```

### Step 4: sequence-processor.ts 修正

processSequences関数で1通目のdelay_minutes処理:

```typescript
// 1通目でdelay_minutesが設定されている場合
if (step.step_number === 1 && step.delay_minutes !== null && step.delay_minutes !== undefined) {
  const enrolledAt = enrollment.started_at * 1000;
  const sendAt = enrolledAt + (step.delay_minutes * 60 * 1000);

  if (now.getTime() < sendAt) {
    continue; // まだ送信時刻になっていない
  }
  // delay_minutesが0または経過済みなら送信処理へ
}
```

### Step 5: SequenceStepEditor.tsx 修正

SequenceStep interface に delay_minutes 追加。

SortableStep内、index === 0 の場合のみUI表示:

```tsx
{index === 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
    <label className="block text-sm font-medium text-blue-800 mb-1">
      登録からの遅延（分）
    </label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={step.delay_minutes ?? ''}
        onChange={(e) => onUpdate(index, 'delay_minutes', e.target.value === '' ? null : parseInt(e.target.value))}
        min="0"
        placeholder="0"
        className="w-24 px-3 py-2 border border-blue-300 rounded-lg focus:ring-blue-500"
      />
      <span className="text-sm text-blue-700">分後に送信</span>
    </div>
    <p className="text-xs text-blue-600 mt-1">
      0 = 登録後すぐに送信。設定すると「送信までの日数」より優先されます。
    </p>
  </div>
)}
```

### Step 6: SequenceForm.tsx 修正

SequenceStep interface に delay_minutes 追加:

```tsx
interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number | null;
  subject: string;
  content: string;
}
```

**🔍 ユーザー確認ポイント:**

ローカルWorkerとAstro両方起動して確認:

- [ ] `/admin/sequences/new` でシーケンス新規作成
- [ ] 1通目のステップに「登録からの遅延（分）」入力欄がある（青い背景）
- [ ] 2通目以降にはこの入力欄がない
- [ ] 0分で設定して保存 → 即時送信として認識される
- [ ] 30分で設定して保存 → 値が保存される
- [ ] 既存シーケンス編集でも同様に動作する

**Step 7: 確認OKならコミット**

```bash
git add workers/newsletter/schema.sql workers/newsletter/src/types.ts workers/newsletter/src/routes/sequences.ts workers/newsletter/src/lib/sequence-processor.ts src/components/admin/SequenceStepEditor.tsx src/components/admin/SequenceForm.tsx
git commit -m "feat(sequences): add delay_minutes for first step immediate delivery"
```

---

## Task 7: 本番デプロイと最終確認

### Step 1: 本番D1にマイグレーション

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan/workers/newsletter
npx wrangler d1 execute edgeshift-newsletter --remote --command="ALTER TABLE sequence_steps ADD COLUMN delay_minutes INTEGER DEFAULT NULL"
```

### Step 2: Workerデプロイ

```bash
npm run deploy
```

### Step 3: Pagesビルド＆デプロイ

```bash
cd /Users/naoya/srv/workspace/dev/edgeshift/.worktrees/batch-tb-test-plan
npm run build
npx wrangler pages deploy dist --project-name edgeshift
```

**🔍 ユーザー確認ポイント（本番）:**

https://edgeshift.tech/admin で確認:

- [ ] ナビゲーションが正しく表示される（ニュースレター、コンタクトリスト、サインアップページ）
- [ ] ダッシュボードにシーケンス統計が表示される
- [ ] コンタクトリストページに「全購読者」がある
- [ ] 全購読者から個別編集ができる
- [ ] シーケンス詳細で配信タイミングが表示される
- [ ] シーケンス作成で1通目に分単位設定ができる

### Step 4: 最終コミット

```bash
git add -A
git commit -m "chore: complete admin UI overhaul deployment"
```

---

## サマリー

| Task | 内容 | 確認項目 |
|------|------|---------|
| 1 | ナビゲーション変更 | サイドバーのリンク構成 |
| 2 | キャンペーン→ニュースレター | 名称とラベル |
| 3 | ダッシュボードにシーケンス統計 | KPIカード表示 |
| 4 | Contact List統合 | 全購読者表示と編集機能 |
| 5 | シーケンス詳細でdelay_time | 配信タイミング列 |
| 6 | 1通目の分単位設定 | delay_minutes入力欄 |
| 7 | 本番デプロイ | 全機能の動作確認 |
