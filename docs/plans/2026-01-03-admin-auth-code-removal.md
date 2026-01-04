# Admin認証コード削除 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cloudflare Access 設定完了に伴い、不要になった認証コードを削除して `/admin/*` にログインできるようにする

**Architecture:** Cloudflare Access が `/admin/*` を Google OAuth で保護済み。アプリケーション側の認証チェック（SessionAuthProvider, AuthProvider）を除去し、コンポーネントを直接レンダリングする。

**Tech Stack:** Astro, React, TypeScript

---

## 変更サマリ

| 種別 | ファイル数 | 内容 |
|------|-----------|------|
| 削除 | 1 | AuthProvider.tsx |
| 修正 | 22 | /admin/*.astro から SessionAuthProvider 除去 |
| 修正 | 1 | AdminDashboard.tsx から useSessionAuth 依存除去 |
| 修正 | 1 | LogoutButton.tsx を CF Access ログアウトに変更 |

## 設定確認

| 項目 | 値 |
|------|-----|
| Team Domain | `kuma8088` |
| ログアウト URL | `https://kuma8088.cloudflareaccess.com/cdn-cgi/access/logout` |

---

### Task 1: AuthProvider.tsx を削除

**Files:**
- Delete: `src/components/admin/AuthProvider.tsx`

**Step 1: ファイル削除**

```bash
rm src/components/admin/AuthProvider.tsx
```

**Step 2: 参照がないことを確認**

```bash
grep -r "AuthProvider" src/
```

Expected: `components/auth/SessionAuthProvider.tsx` のみがヒット（これは別物なので OK）

**Step 3: コミット**

```bash
git add -A
git commit -m "feat(auth): remove legacy AuthProvider for API key authentication

Cloudflare Access now handles admin authentication via Google OAuth.
The API key-based AuthProvider is no longer needed.

GAP-AUTH-007, GAP-ADMIN-AUTH-002"
```

---

### Task 2: AdminDashboard.tsx から useSessionAuth 依存を除去

**Files:**
- Modify: `src/components/auth/AdminDashboard.tsx`

**Step 1: useSessionAuth 依存を除去し、CF Access ログアウトに変更**

変更前:
```tsx
import { useSessionAuth } from './SessionAuthProvider';

export function AdminDashboard() {
  const { user, logout } = useSessionAuth();
  // ... user?.email, user?.role, logout を使用
}
```

変更後:
```tsx
export function AdminDashboard() {
  const menuItems = [
    {
      title: 'ダッシュボード',
      href: '/admin',
      description: 'ニュースレターの統計情報',
    },
    {
      title: 'ニュースレター管理',
      href: '/admin/campaigns',
      description: 'キャンペーンの作成・編集',
    },
    {
      title: '購読者管理',
      href: '/admin/subscribers',
      description: '購読者リストの管理',
    },
    {
      title: '決済管理',
      href: '/admin/payments',
      description: 'プラン・商品・サブスクリプション',
    },
    {
      title: 'シーケンス',
      href: '/admin/sequences',
      description: '自動メールシーケンス',
    },
    {
      title: '分析',
      href: '/admin/analytics',
      description: '詳細な分析データ',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          管理ダッシュボード
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {menuItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block p-6 bg-white rounded-xl border border-[var(--color-border)]
                     hover:border-[var(--color-accent)] hover:shadow-md transition-all group"
          >
            <h3 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {item.description}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
```

> **注意**: ログアウトボタンは AdminLayout.astro の LogoutButton で提供されるため、ここでは削除

**Step 2: ビルドチェック**

```bash
npm run check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/components/auth/AdminDashboard.tsx
git commit -m "refactor(auth): remove useSessionAuth dependency from AdminDashboard

Cloudflare Access handles authentication. User info display removed.
Logout button is provided by LogoutButton in AdminLayout."
```

---

### Task 3: LogoutButton.tsx を CF Access ログアウトに変更

**Files:**
- Modify: `src/components/admin/LogoutButton.tsx`

**Step 1: CF Access ログアウト URL にリダイレクトするよう変更**

変更前:
```tsx
'use client';

import { clearApiKey } from '../../utils/admin-api';

export function LogoutButton() {
  const handleLogout = () => {
    clearApiKey();
    window.location.href = '/admin';
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full px-4 py-2 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] rounded-lg transition-colors"
    >
      ログアウト
    </button>
  );
}
```

変更後:
```tsx
'use client';

// CF Access logout URL
const CF_ACCESS_LOGOUT_URL = 'https://kuma8088.cloudflareaccess.com/cdn-cgi/access/logout';

export function LogoutButton() {
  const handleLogout = () => {
    window.location.href = CF_ACCESS_LOGOUT_URL;
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full px-4 py-2 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] rounded-lg transition-colors"
    >
      ログアウト
    </button>
  );
}
```

**Step 2: ビルドチェック**

```bash
npm run check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/components/admin/LogoutButton.tsx
git commit -m "feat(auth): update LogoutButton to use Cloudflare Access logout

Redirect to CF Access logout URL instead of clearing local API key.
This properly terminates the Cloudflare Access session."
```

---

### Task 4: /admin/*.astro から SessionAuthProvider を除去

**Files:**
- Modify: 22 files in `src/pages/admin/**/*.astro`

**Step 1: 各ファイルを修正**

パターン（例: `src/pages/admin/index.astro`）:

変更前:
```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { SessionAuthProvider } from '../../components/auth/SessionAuthProvider';
import { Dashboard } from '../../components/admin/Dashboard';
---

<AdminLayout title="ダッシュボード">
  <SessionAuthProvider client:load requiredRole={['owner', 'admin']}>
    <Dashboard client:load />
  </SessionAuthProvider>
</AdminLayout>
```

変更後:
```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { Dashboard } from '../../components/admin/Dashboard';
---

<AdminLayout title="ダッシュボード">
  <Dashboard client:load />
</AdminLayout>
```

**修正対象ファイル一覧（22ファイル）:**

1. `src/pages/admin/index.astro`
2. `src/pages/admin/analytics/index.astro`
3. `src/pages/admin/campaigns/index.astro`
4. `src/pages/admin/campaigns/new.astro`
5. `src/pages/admin/campaigns/edit.astro`
6. `src/pages/admin/campaigns/detail.astro`
7. `src/pages/admin/sequences/index.astro`
8. `src/pages/admin/sequences/new.astro`
9. `src/pages/admin/sequences/edit.astro`
10. `src/pages/admin/sequences/detail.astro`
11. `src/pages/admin/signup-pages/index.astro`
12. `src/pages/admin/signup-pages/create.astro`
13. `src/pages/admin/signup-pages/edit.astro`
14. `src/pages/admin/referrals/index.astro`
15. `src/pages/admin/payments/index.astro`
16. `src/pages/admin/payments/products.astro`
17. `src/pages/admin/payments/billing.astro`
18. `src/pages/admin/payments/billing/[id].astro`
19. `src/pages/admin/payments/plans/new.astro`
20. `src/pages/admin/payments/plans/edit.astro`
21. `src/pages/admin/payments/products/new.astro`
22. `src/pages/admin/payments/products/edit.astro`

**Step 2: 全ファイル修正完了後、参照確認**

```bash
grep -r "SessionAuthProvider" src/pages/admin/
```

Expected: 出力なし（admin 配下に SessionAuthProvider の参照がないこと）

**Step 3: ビルドチェック**

```bash
npm run check
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add src/pages/admin/
git commit -m "feat(auth): remove SessionAuthProvider from all admin pages

Cloudflare Access now protects /admin/* via Google OAuth.
SessionAuthProvider is reserved for subscriber portal (/my/*).

GAP-ADMIN-AUTH-003"
```

---

### Task 5: ビルド検証

**Step 1: フルビルド**

```bash
npm run build
```

Expected: 成功

**Step 2: 開発サーバー起動確認**

```bash
npm run dev
```

Expected: エラーなく起動

**Step 3: 最終コミット（必要に応じて）**

問題がなければ完了。

---

## 完了条件チェックリスト

- [ ] AuthProvider.tsx が削除されている
- [ ] AdminDashboard.tsx が useSessionAuth に依存していない
- [ ] LogoutButton.tsx が CF Access ログアウト URL にリダイレクトする
- [ ] `/admin/*.astro`（22ファイル）から SessionAuthProvider が除去されている
- [ ] ビルドが成功する
- [ ] `/admin/` にアクセスして Cloudflare Access ログイン画面が表示される
- [ ] ログイン後に管理画面が表示される
- [ ] ログアウトボタンで CF Access からログアウトできる

---

## 関連ドキュメント

> edgeshift-premium リポジトリを参照

- 認証設計: `edgeshift-premium/docs/plans/2026-01-02-phase6-auth-architecture-design.md`
- ギャップ分析: `edgeshift-premium/docs/spec/_gaps.md`
- CF Access 設定: `edgeshift-premium/docs/settings/cloudflare-access-setup.md`
