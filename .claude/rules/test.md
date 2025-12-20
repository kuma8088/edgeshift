---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "**/*.test.js"
  - "**/*.spec.js"
  - "tests/**/*"
  - "__tests__/**/*"
  - "test/**/*"
---

# テスト規約

---

## テストの原則

```
1. テストは仕様書である
   - 何をテストしているか明確に
   - テスト名で意図が伝わる

2. AAA パターン
   - Arrange: 準備
   - Act: 実行
   - Assert: 検証

3. 独立性
   - テスト間で状態を共有しない
   - 実行順序に依存しない
```

---

## 命名規則

```typescript
// Good: 何をテストしているか明確
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with valid input', async () => { ... });
    it('should throw ValidationError when email is invalid', async () => { ... });
    it('should hash password before saving', async () => { ... });
  });
});

// Bad: 曖昧な名前
describe('UserService', () => {
  it('test1', async () => { ... });
  it('works', async () => { ... });
});
```

---

## AAA パターン

```typescript
it('should calculate total with tax', () => {
  // Arrange: 準備
  const items = [
    { price: 100, quantity: 2 },
    { price: 50, quantity: 1 },
  ];
  const taxRate = 0.1;

  // Act: 実行
  const result = calculateTotal(items, taxRate);

  // Assert: 検証
  expect(result).toBe(275); // (100*2 + 50) * 1.1
});
```

---

## モックの使用

```typescript
// Good: 必要最小限のモック
import { vi } from 'vitest';

const mockFetch = vi.fn();
vi.mock('node-fetch', () => ({ default: mockFetch }));

it('should fetch user data', async () => {
  // Arrange
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: 1, name: 'John' }),
  });

  // Act
  const user = await fetchUser(1);

  // Assert
  expect(user.name).toBe('John');
  expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/users/1');
});

// Bad: 過剰なモック
// 実装の詳細までモックすると、リファクタリング時にテストが壊れやすい
```

---

## 非同期テスト

```typescript
// Good: async/await を使用
it('should fetch user', async () => {
  const user = await userService.getUser(1);
  expect(user.name).toBe('John');
});

// Good: 例外のテスト
it('should throw when user not found', async () => {
  await expect(userService.getUser(999)).rejects.toThrow('User not found');
});

// Bad: done コールバック（古いスタイル）
it('should fetch user', (done) => {
  userService.getUser(1).then((user) => {
    expect(user.name).toBe('John');
    done();
  });
});
```

---

## テストデータ

```typescript
// Good: Factory パターン
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

it('should update user name', async () => {
  const user = createTestUser({ name: 'Original' });
  const updated = await userService.updateName(user.id, 'Updated');
  expect(updated.name).toBe('Updated');
});

// Bad: マジックナンバー/文字列
it('should update user name', async () => {
  const updated = await userService.updateName('abc123', 'John');
  expect(updated.name).toBe('John');
});
```

---

## エッジケースのテスト

```typescript
describe('calculateTotal', () => {
  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should handle negative prices', () => {
    const items = [{ price: -100, quantity: 1 }];
    expect(() => calculateTotal(items)).toThrow('Price cannot be negative');
  });

  it('should handle very large numbers', () => {
    const items = [{ price: Number.MAX_SAFE_INTEGER, quantity: 1 }];
    expect(calculateTotal(items)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle decimal quantities', () => {
    const items = [{ price: 100, quantity: 0.5 }];
    expect(calculateTotal(items)).toBe(50);
  });
});
```

---

## コンポーネントテスト（React）

```typescript
import { render, screen, fireEvent } from '@testing-library/react';

describe('LoginForm', () => {
  it('should show error message for invalid email', async () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const submitButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
  });

  it('should call onSubmit with form data', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });
});
```

---

## 禁止パターン

```typescript
// テスト内でのランダム値（再現性がない）
it('should work', () => {
  const value = Math.random();
  expect(process(value)).toBe(true); // 失敗時に再現できない
});

// 実装の詳細に依存
it('should call internal method', () => {
  const spy = vi.spyOn(service, '_internalMethod'); // プライベートメソッド
  service.publicMethod();
  expect(spy).toHaveBeenCalled(); // リファクタリングで壊れる
});

// 複数のことをテスト
it('should create and update user', async () => {
  const user = await createUser({ name: 'John' });
  expect(user.name).toBe('John');

  const updated = await updateUser(user.id, { name: 'Jane' });
  expect(updated.name).toBe('Jane'); // 別のテストに分割すべき
});
```
