---
paths:
  - "**/auth/**/*"
  - "**/authentication/**/*"
  - "**/authorization/**/*"
  - "**/login/**/*"
  - "**/payment/**/*"
  - "**/checkout/**/*"
  - "**/api/**/*"
  - "**/middleware/**/*"
---

# セキュリティ規約

---

## 絶対に行わないこと

```
API キー・シークレットをコードにハードコード
.env ファイルを Git にコミット
本番データベースに直接接続するコード
eval() や動的コード実行
ユーザー入力の無検証での使用
```

---

## 認証・認可

### JWT の取り扱い

```typescript
// Good: httpOnly Cookie で保存
res.setHeader('Set-Cookie', serialize('token', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 60 * 60 * 24 * 7, // 7日
  path: '/',
}));

// Bad: localStorage に保存（XSS で漏洩リスク）
localStorage.setItem('token', jwt);
```

### パスワード

```typescript
// Good: bcrypt でハッシュ化
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;
const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

// 検証
const isValid = await bcrypt.compare(inputPassword, hashedPassword);

// Bad: 平文で保存
db.user.create({ password: password }); // 絶対NG
```

---

## 入力バリデーション

```typescript
// Good: zod でバリデーション
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  age: z.number().int().positive().max(150),
});

function createUser(input: unknown) {
  const validated = UserSchema.parse(input); // 不正な場合は例外
  return db.user.create({ data: validated });
}

// Bad: バリデーションなし
function createUser(input: any) {
  return db.user.create({ data: input }); // 危険
}
```

---

## SQL インジェクション対策

```typescript
// Good: パラメータ化クエリ
const user = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Prisma の場合（自動的に安全）
const user = await prisma.user.findUnique({
  where: { id: userId },
});

// Bad: 文字列連結
const user = await db.query(
  `SELECT * FROM users WHERE id = '${userId}'` // 危険
);
```

---

## XSS 対策

```typescript
// Good: React は自動エスケープ
function Comment({ text }: { text: string }) {
  return <p>{text}</p>; // 自動的にエスケープ
}

// Bad: dangerouslySetInnerHTML
function Comment({ html }: { html: string }) {
  return <p dangerouslySetInnerHTML={{ __html: html }} />; // 危険
}

// どうしても必要な場合: サニタイズ
import DOMPurify from 'dompurify';

function Comment({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html);
  return <p dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

---

## CORS 設定

```typescript
// Good: 許可するオリジンを明示
const corsOptions = {
  origin: [
    'https://example.com',
    'https://app.example.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};

// Bad: 全オリジン許可
const corsOptions = {
  origin: '*', // 本番環境では危険
};
```

---

## 機密情報の露出防止

```typescript
// Good: 必要なフィールドのみ返す
async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      // password, refreshToken は含めない
    },
  });
  return user;
}

// Bad: 全フィールドを返す
async function getUser(id: string) {
  return await prisma.user.findUnique({
    where: { id },
  }); // password なども含まれる可能性
}
```

---

## レート制限

```typescript
// Good: レート制限を実装
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 100リクエストまで
  message: 'Too many requests, please try again later.',
});

app.use('/api/', apiLimiter);

// 認証エンドポイントはより厳しく
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 5, // 5回まで
});

app.use('/api/auth/login', authLimiter);
```

---

## セキュリティヘッダー

```typescript
// Good: helmet を使用
import helmet from 'helmet';

app.use(helmet());

// または Next.js の場合
// next.config.js
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

---

## チェックリスト

```
実装前:
[ ] 認証が必要なエンドポイントか確認
[ ] 入力バリデーションの設計
[ ] エラーメッセージに機密情報を含めない設計

実装後:
[ ] SQL インジェクション対策
[ ] XSS 対策
[ ] CSRF 対策（必要な場合）
[ ] レート制限
[ ] 適切なエラーハンドリング
[ ] ログに機密情報を出力していない
```
