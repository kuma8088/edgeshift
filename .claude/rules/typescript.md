---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

# TypeScript / JavaScript コーディング規約

---

## 型安全性

```typescript
// Good: 戻り値の型を明示
const fetchData = async (): Promise<Data> => { ... };

// Bad: 戻り値の型がない
const fetchData = async () => { ... };
```

```typescript
// Good: 引数の型を明示
function processItems(items: string[]): void { ... }

// Bad: any を使用
function processItems(items: any): void { ... }
```

---

## 定数とマジックナンバー

```typescript
// Good: 定数として定義
const MAX_RETRY_COUNT = 3;
const API_TIMEOUT_MS = 5000;

for (let i = 0; i < MAX_RETRY_COUNT; i++) { ... }

// Bad: マジックナンバー
for (let i = 0; i < 3; i++) { ... }
```

---

## エラーハンドリング

```typescript
// Good: 適切なエラーハンドリング
try {
  const result = await apiCall();
  return result;
} catch (error) {
  if (error instanceof NetworkError) {
    logger.error('Network failed', { error });
    throw new ServiceUnavailableError('API is temporarily unavailable');
  }
  throw error;
}

// Bad: エラーを握りつぶす
try {
  const result = await apiCall();
  return result;
} catch (error) {
  return null; // 問題を隠蔽
}
```

---

## 非同期処理

```typescript
// Good: Promise.all で並列実行
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts(),
]);

// Bad: 順次実行（不要な待機）
const users = await fetchUsers();
const posts = await fetchPosts();
```

---

## インポート順序

```typescript
// 1. 外部ライブラリ
import React from 'react';
import { useState } from 'react';

// 2. 内部モジュール（絶対パス）
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';

// 3. 相対パス
import { helper } from './helper';
import type { Props } from './types';
```

---

## 命名規則

```typescript
// 変数・関数: camelCase
const userName = 'John';
function getUserById(id: string) { ... }

// 型・インターフェース: PascalCase
interface UserProfile { ... }
type RequestOptions = { ... };

// 定数: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 1024 * 1024;
const API_BASE_URL = 'https://api.example.com';

// プライベート: _prefix は使わない（TypeScript の private を使用）
class Service {
  private cache: Map<string, Data>;  // Good
  private _cache: Map<string, Data>; // Bad
}
```

---

## null / undefined の扱い

```typescript
// Good: オプショナルチェイニング
const name = user?.profile?.name ?? 'Anonymous';

// Bad: 冗長なチェック
const name = user && user.profile && user.profile.name
  ? user.profile.name
  : 'Anonymous';
```

---

## 禁止パターン

```typescript
// any の使用
function process(data: any) { ... } // Bad

// @ts-ignore の乱用
// @ts-ignore  // Bad: 理由なく使用
someFunction();

// console.log の本番残存
console.log('debug:', data); // Bad: 本番環境に残さない
```
