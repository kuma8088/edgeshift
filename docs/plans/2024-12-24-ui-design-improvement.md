# UI Design Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** EdgeShift UIをライトテーマに統一し、WCAG AA準拠のコントラスト比を確保する

**Architecture:** CSS Variablesをdesign-guide準拠に再定義し、31ファイルのハードコード色をCSS Variablesに置換。AdminサイドバーをライトテーマにhL変更。

**Tech Stack:** Astro, React, Tailwind CSS v4, CSS Variables

---

## Task 1: CSS Variables定義の更新

**Files:**
- Modify: `src/styles/global.css`

**Step 1: global.cssのCSS Variables定義を更新**

```css
@import "tailwindcss";

/* EdgeShift Design Tokens - Light Theme (Obsidian-inspired) */
:root {
  /* Backgrounds */
  --color-bg: #ffffff;
  --color-bg-secondary: #fafafa;
  --color-bg-tertiary: #f5f5f5;

  /* Accent - Purple */
  --color-accent: #7c3aed;
  --color-accent-hover: #6d28d9;
  --color-accent-light: #ede9fe;

  /* Text - WCAG AA Compliant */
  --color-text: #171717;           /* gray-900 - primary */
  --color-text-secondary: #525252; /* gray-600 - body */
  --color-text-muted: #737373;     /* gray-500 - subtle (white bg only) */

  /* Borders */
  --color-border: #e5e5e5;         /* gray-200 */
  --color-border-hover: #d4d4d4;   /* gray-300 */

  /* Semantic */
  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-error: #dc2626;

  /* White */
  --color-white: #ffffff;
}

/* Base Styles */
html {
  scroll-behavior: smooth;
  font-size: 16px;
}

@media (min-width: 768px) {
  html {
    font-size: 17px;
  }
}

body {
  background-color: var(--color-bg);
  color: var(--color-text-secondary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
  line-height: 1.6;
}

/* Selection */
::selection {
  background-color: var(--color-accent);
  color: var(--color-white);
}

/* Scrollbar - Light theme */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--color-border-hover);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
```

**Step 2: 確認**

Run: `npm run dev`
Expected: サイトが正常に表示される（まだ一部ダーク表示あり）

**Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "refactor: update CSS variables for light theme"
```

---

## Task 2: Header/Footerのライトテーマ対応

**Files:**
- Modify: `src/components/Header.astro`
- Modify: `src/components/Footer.astro`

**Step 1: Header.astroを更新**

```astro
---
const navItems = [
  { href: '#skills', label: 'Skills' },
  { href: '#portfolio', label: 'Portfolio' },
  { href: '#about', label: 'About' },
  { href: '#blog', label: 'Blog' },
  { href: '#contact', label: 'Contact' },
];
---

<header class="fixed top-0 left-0 right-0 z-50 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
  <nav class="max-w-5xl mx-auto px-6 py-4">
    <div class="flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors">
        EdgeShift
      </a>

      <!-- Desktop Navigation -->
      <ul class="hidden md:flex gap-8">
        {navItems.map((item) => (
          <li>
            <a
              href={item.href}
              class="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>

      <!-- Mobile Hamburger Button -->
      <button
        id="mobile-menu-btn"
        class="md:hidden p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        aria-label="Toggle menu"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path id="hamburger-icon" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          <path id="close-icon" class="hidden" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Mobile Navigation -->
    <div id="mobile-menu" class="hidden md:hidden mt-4 pb-2">
      <ul class="flex flex-col gap-4">
        {navItems.map((item) => (
          <li>
            <a
              href={item.href}
              class="block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors py-2"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </nav>
</header>

<script>
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const hamburgerIcon = document.getElementById('hamburger-icon');
  const closeIcon = document.getElementById('close-icon');

  menuBtn?.addEventListener('click', () => {
    mobileMenu?.classList.toggle('hidden');
    hamburgerIcon?.classList.toggle('hidden');
    closeIcon?.classList.toggle('hidden');
  });

  // Close menu when clicking a link
  mobileMenu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu?.classList.add('hidden');
      hamburgerIcon?.classList.remove('hidden');
      closeIcon?.classList.add('hidden');
    });
  });
</script>
```

**Step 2: Footer.astroを更新**

```astro
---
const socialLinks = [
  { href: 'https://github.com/edge-shift', label: 'GitHub' },
  { href: 'https://zenn.dev/', label: 'Zenn' },
  { href: 'https://twitter.com/', label: 'X' },
  { href: 'https://linkedin.com/', label: 'LinkedIn' },
];

const currentYear = new Date().getFullYear();
---

<footer class="bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)]">
  <div class="max-w-5xl mx-auto px-6 py-12">
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      <div>
        <p class="text-lg font-bold text-[var(--color-text)] mb-1">EdgeShift</p>
        <p class="text-sm text-[var(--color-text-secondary)]">
          Transform your business edge with DX
        </p>
      </div>
      <ul class="flex gap-6">
        {socialLinks.map((link) => (
          <li>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
    <div class="mt-8 pt-6 border-t border-[var(--color-border)] text-center">
      <p class="text-sm text-[var(--color-text-muted)]">
        &copy; {currentYear} EdgeShift. All rights reserved.
      </p>
    </div>
  </div>
</footer>
```

**Step 3: 確認**

Run: `npm run dev`
Expected: ヘッダー/フッターがライトテーマで表示

**Step 4: Commit**

```bash
git add src/components/Header.astro src/components/Footer.astro
git commit -m "refactor: update Header/Footer for light theme"
```

---

## Task 3: AdminLayoutのライトテーマ対応

**Files:**
- Modify: `src/layouts/AdminLayout.astro`

**Step 1: AdminLayout.astroを更新**

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
}

const { title } = Astro.props;
const fullTitle = `${title} | EdgeShift Admin`;
---

<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{fullTitle}</title>
  </head>
  <body class="min-h-screen bg-[var(--color-bg-secondary)]">
    <div class="flex min-h-screen">
      <!-- Sidebar - Light theme -->
      <aside class="w-64 bg-[var(--color-bg)] border-r border-[var(--color-border)] flex-shrink-0">
        <div class="p-4 border-b border-[var(--color-border)]">
          <a href="/admin" class="text-xl font-bold text-[var(--color-accent)]">EdgeShift Admin</a>
        </div>
        <nav class="p-4">
          <ul class="space-y-2">
            <li>
              <a href="/admin" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
                ダッシュボード
              </a>
            </li>
            <li>
              <a href="/admin/campaigns" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
                キャンペーン
              </a>
            </li>
            <li>
              <a href="/admin/sequences" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
                シーケンス
              </a>
            </li>
            <li>
              <a href="/admin/subscribers" class="block px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] transition-colors">
                購読者
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="flex-1 p-8">
        <slot />
      </main>
    </div>
  </body>
</html>
```

**Step 2: 確認**

Run: `npm run dev`
Navigate to: `/admin`
Expected: サイドバーがライトテーマで表示

**Step 3: Commit**

```bash
git add src/layouts/AdminLayout.astro
git commit -m "refactor: update AdminLayout sidebar to light theme"
```

---

## Task 4: index.astroのハードコード色をCSS Variables化

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: 色の置換ルール**

| Before | After |
|:--|:--|
| `#1e1e1e` | `var(--color-text)` |
| `#525252` | `var(--color-text-secondary)` |
| `#737373` | `var(--color-text-muted)` |
| `#a3a3a3` | `var(--color-text-muted)` |
| `#7c3aed` | `var(--color-accent)` |
| `#6d28d9` | `var(--color-accent-hover)` |
| `#e5e5e5` | `var(--color-border)` |
| `#f5f5f5` | `var(--color-bg-tertiary)` |
| `#fafafa` | `var(--color-bg-secondary)` |
| `#333` | `var(--color-text)` |

**Step 2: index.astroを全体更新**

主な変更箇所:
- Hero section: `bg-[#1e1e1e]` → `bg-[var(--color-accent)]`（ボタン色を紫に統一）
- テキスト色: ハードコード → CSS Variables
- 背景色: ハードコード → CSS Variables
- ボーダー色: ハードコード → CSS Variables

**Step 3: 確認**

Run: `npm run dev`
Expected: ランディングページ全体がライトテーマで統一

**Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "refactor: replace hardcoded colors with CSS variables in index.astro"
```

---

## Task 5: Adminコンポーネントのハードコード色をCSS Variables化

**Files:**
- Modify: `src/components/admin/Dashboard.tsx`
- Modify: `src/components/admin/CampaignList.tsx`
- Modify: `src/components/admin/SubscriberList.tsx`
- Modify: `src/components/admin/SequenceList.tsx`
- Modify: `src/components/admin/KPICard.tsx`
- Modify: 他のadminコンポーネント

**Step 1: 各コンポーネントでハードコード色を置換**

同じ置換ルール（Task 4参照）を適用

**Step 2: 確認**

Run: `npm run dev`
Navigate to: `/admin`, `/admin/campaigns`, `/admin/subscribers`
Expected: 全Adminページがライトテーマで統一

**Step 3: Commit**

```bash
git add src/components/admin/
git commit -m "refactor: replace hardcoded colors with CSS variables in admin components"
```

---

## Task 6: 残りのコンポーネント/ページの更新

**Files:**
- `src/components/NewsletterForm.astro`
- `src/components/ContactForm.astro`
- `src/components/TypingHero.astro`
- `src/components/zenn/*.tsx`
- `src/pages/newsletter/*.astro`
- その他31ファイル中の未対応ファイル

**Step 1: 各ファイルでハードコード色を置換**

**Step 2: 確認**

Run: `npm run dev`
Expected: 全ページでライトテーマ統一、コントラスト比改善

**Step 3: Commit**

```bash
git add .
git commit -m "refactor: replace remaining hardcoded colors with CSS variables"
```

---

## Task 7: 最終確認とビルド

**Step 1: 全ページの目視確認**

- `/` - ランディングページ
- `/admin` - ダッシュボード
- `/admin/campaigns` - キャンペーン一覧
- `/admin/subscribers` - 購読者一覧
- `/admin/sequences` - シーケンス一覧
- `/newsletter/confirmed` - 登録完了ページ

**Step 2: ビルド確認**

Run: `npm run build`
Expected: エラーなくビルド完了

**Step 3: 型チェック**

Run: `npm run check`
Expected: 型エラーなし

**Step 4: 最終Commit**

```bash
git add .
git commit -m "feat: complete UI design improvement - light theme unification"
```

---

## Summary

| Task | Description | Files |
|:--|:--|:--|
| 1 | CSS Variables定義更新 | global.css |
| 2 | Header/Footer更新 | Header.astro, Footer.astro |
| 3 | AdminLayout更新 | AdminLayout.astro |
| 4 | index.astro更新 | index.astro |
| 5 | Adminコンポーネント更新 | admin/*.tsx (約10ファイル) |
| 6 | 残りファイル更新 | 約15ファイル |
| 7 | 最終確認 | - |

## Future TODO

- [ ] ダークモード切り替え機能の実装
