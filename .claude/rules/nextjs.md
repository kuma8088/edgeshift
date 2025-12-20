---
paths:
  - "src/app/**/*"
  - "src/components/**/*"
  - "src/pages/**/*"
  - "app/**/*"
  - "components/**/*"
  - "pages/**/*"
---

# Next.js ベストプラクティス

---

## Server Components vs Client Components

```tsx
// デフォルト: Server Component
// データフェッチ、静的コンテンツに使用
export default async function UserProfile({ userId }: Props) {
  const user = await fetchUser(userId); // サーバーで実行
  return <div>{user.name}</div>;
}

// 必要な場合のみ: Client Component
// インタラクティブな機能に使用
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

---

## 'use client' の使用基準

```tsx
// 'use client' が必要なケース
// - useState, useEffect などの React hooks を使用
// - onClick などのイベントハンドラを使用
// - ブラウザ API（localStorage, window）を使用

// 'use client' が不要なケース
// - 静的なUI表示のみ
// - データフェッチ（fetch, prisma など）
// - サーバーサイドの処理
```

---

## データフェッチ

```tsx
// Good: Server Component でデータフェッチ
export default async function PostList() {
  const posts = await db.post.findMany();
  return (
    <ul>
      {posts.map(post => (
        <PostItem key={post.id} post={post} />
      ))}
    </ul>
  );
}

// Bad: Client Component で useEffect
'use client';
export function PostList() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(setPosts);
  }, []);

  return <ul>...</ul>;
}
```

---

## loading.tsx / error.tsx

```
src/app/
├── posts/
│   ├── page.tsx
│   ├── loading.tsx    # ローディングUI
│   └── error.tsx      # エラーUI
```

```tsx
// loading.tsx
export default function Loading() {
  return <div className="animate-pulse">Loading...</div>;
}

// error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

---

## 画像最適化

```tsx
// Good: next/image を使用
import Image from 'next/image';

export function Avatar({ src, alt }: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      width={100}
      height={100}
      className="rounded-full"
    />
  );
}

// Bad: 通常の img タグ
export function Avatar({ src, alt }: Props) {
  return <img src={src} alt={alt} />;
}
```

---

## メタデータ

```tsx
// Good: metadata API を使用
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ページタイトル',
  description: 'ページの説明',
  openGraph: {
    title: 'OGタイトル',
    description: 'OG説明',
    images: ['/og-image.png'],
  },
};

export default function Page() {
  return <main>...</main>;
}
```

---

## API Routes

```tsx
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await db.user.findMany();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.email) {
    return NextResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    );
  }

  const user = await db.user.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}
```

---

## 禁止パターン

```tsx
// useEffect の多用（Server Component で代替可能）
useEffect(() => {
  fetchData();
}, []);

// 不要な 'use client'
'use client';
export function StaticHeader() {
  return <header>Static Content</header>; // hooks 不使用なのに 'use client'
}

// getServerSideProps / getStaticProps（App Router では非推奨）
export async function getServerSideProps() { ... }
```
