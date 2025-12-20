---
paths:
  - "supabase/**/*"
  - "src/lib/supabase/**/*"
  - "**/supabase.ts"
  - "**/supabase-client.ts"
---

# Supabase ベストプラクティス

---

## Row Level Security (RLS)

```sql
-- 必須: RLS を有効化
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Good: 適切なポリシー
CREATE POLICY "Users can view their own posts"
ON posts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own posts"
ON posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
ON posts FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
ON posts FOR DELETE
USING (auth.uid() = user_id);
```

---

## クライアント設定

```typescript
// Good: 環境変数から設定を取得
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Bad: ハードコード
const supabase = createClient(
  'https://xxx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);
```

---

## サービスロールの使用

```typescript
// サーバーサイドのみで使用
// 絶対にクライアントに公開しない
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // 危険: サーバーのみ
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// 使用ケース: 管理者操作、RLS をバイパスする必要がある場合
```

---

## 型安全なクエリ

```typescript
// Good: 型を生成して使用
import { Database } from '@/types/supabase';

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// 型補完が効く
const { data, error } = await supabase
  .from('posts')
  .select('id, title, created_at')
  .eq('user_id', userId);

// data の型: { id: number; title: string; created_at: string }[] | null
```

型生成コマンド:
```bash
npx supabase gen types typescript --project-id <project-id> > types/supabase.ts
```

---

## エラーハンドリング

```typescript
// Good: エラーを適切に処理
async function getPosts(userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch posts:', error.message);
    throw new Error(`Failed to fetch posts: ${error.message}`);
  }

  return data;
}

// Bad: エラーを無視
async function getPosts(userId: string) {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId);

  return data; // error をチェックしていない
}
```

---

## リアルタイム購読

```typescript
// Good: クリーンアップを忘れない
useEffect(() => {
  const channel = supabase
    .channel('posts-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      (payload) => {
        console.log('Change received:', payload);
        // 状態を更新
      }
    )
    .subscribe();

  // クリーンアップ
  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## Edge Functions

```typescript
// supabase/functions/hello/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req: Request) => {
  // CORS ヘッダー
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };

  // プリフライトリクエスト
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name } = await req.json();

    return new Response(
      JSON.stringify({ message: `Hello ${name}!` }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

---

## 禁止事項

```
絶対に行わないこと:
- RLS を無効のままテーブルを公開
- サービスロールキーをクライアントに公開
- 環境変数をハードコード
- エラーを無視してデータを使用
- リアルタイム購読のクリーンアップを忘れる
```
