# Batch 4A: Signup Page Generation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable custom signup page generation with rich text editing for newsletters and email campaigns.

**Architecture:** Database-driven dynamic pages using Cloudflare D1, with Tiptap rich text editor for unified content editing across signup pages, campaigns, and sequences. Pages are generated on-demand via Astro dynamic routes.

**Tech Stack:** Tiptap v2.1 (rich text), Cloudflare D1 (storage), Astro (SSG), React (admin UI)

**Design Reference:** `docs/plans/2025-12-25-signup-page-generation-design.md`

---

## Task 1: Database Extension (30min)

**Files:**
- Modify: `workers/newsletter/schema.sql`
- Test: Manual verification with D1

### Step 1: Add signup_pages table to schema

**Edit:** `workers/newsletter/schema.sql`

Add this after the `click_events` table:

```sql
-- Signup Page Generation (Batch 4A)
CREATE TABLE IF NOT EXISTS signup_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  sequence_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  button_text TEXT DEFAULT '登録する',
  form_fields TEXT DEFAULT 'email,name',
  theme TEXT DEFAULT 'default',

  pending_title TEXT DEFAULT '確認メールを送信しました',
  pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。',

  confirmed_title TEXT DEFAULT '登録が完了しました',
  confirmed_message TEXT DEFAULT 'ニュースレターへのご登録ありがとうございます。',

  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_pages_slug ON signup_pages(slug);
CREATE INDEX IF NOT EXISTS idx_signup_pages_sequence ON signup_pages(sequence_id);
```

### Step 2: Apply migration to local D1

**Run:**
```bash
cd workers/newsletter
npm run db:migrate
```

**Expected:** "Migration applied successfully"

### Step 3: Verify table creation

**Run:**
```bash
npx wrangler d1 execute edgeshift-newsletter --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='signup_pages';"
```

**Expected:** Returns `signup_pages` table name

### Step 4: Commit

```bash
git add workers/newsletter/schema.sql
git commit -m "feat(db): add signup_pages table for Batch 4A

- Add signup_pages table with slug, content, and customization fields
- Add indexes for slug and sequence_id
- Support nullable sequence_id for general newsletter signup"
```

---

## Task 2: Install Tiptap Dependencies (10min)

**Files:**
- Modify: `package.json`

### Step 1: Install Tiptap packages

**Run:**
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder
```

**Expected:** Packages added to `package.json` dependencies

### Step 2: Verify installation

**Run:**
```bash
npm list @tiptap/react
```

**Expected:** Shows `@tiptap/react@2.x.x`

### Step 3: Commit

```bash
git add package.json package-lock.json
git commit -m "chore: install Tiptap rich text editor dependencies

- @tiptap/react
- @tiptap/starter-kit
- @tiptap/extension-link
- @tiptap/extension-placeholder"
```

---

## Task 3: RichTextEditor Component (2h)

**Files:**
- Create: `src/components/admin/RichTextEditor.tsx`
- Create: `src/components/admin/MenuBar.tsx`
- Test: Manual testing in browser

### Step 1: Create MenuBar component

**Create:** `src/components/admin/MenuBar.tsx`

```tsx
import type { Editor } from '@tiptap/react';

interface MenuBarProps {
  editor: Editor | null;
}

export function MenuBar({ editor }: MenuBarProps) {
  if (!editor) {
    return null;
  }

  const buttonClass = (isActive: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded ${
      isActive
        ? 'bg-gray-800 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive('bold'))}
        type="button"
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive('italic'))}
        type="button"
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={buttonClass(editor.isActive('strike'))}
        type="button"
      >
        Strike
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 1 }))}
        type="button"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 2 }))}
        type="button"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 3 }))}
        type="button"
      >
        H3
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(editor.isActive('bulletList'))}
        type="button"
      >
        Bullet List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={buttonClass(editor.isActive('orderedList'))}
        type="button"
      >
        Ordered List
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => {
          const url = window.prompt('Enter URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        className={buttonClass(editor.isActive('link'))}
        type="button"
      >
        Link
      </button>
      <button
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
        className="px-3 py-1.5 text-sm font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
      >
        Unlink
      </button>
    </div>
  );
}
```

### Step 2: Create RichTextEditor component

**Create:** `src/components/admin/RichTextEditor.tsx`

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { MenuBar } from './MenuBar';
import { useEffect } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none',
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

### Step 3: Test RichTextEditor in isolation

Create a temporary test page to verify the component works.

**Create:** `src/pages/admin/test-editor.astro`

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
---

<AdminLayout title="Test Rich Text Editor">
  <div class="max-w-4xl mx-auto p-6">
    <h1 class="text-2xl font-bold mb-4">Rich Text Editor Test</h1>
    <div id="editor-test"></div>
  </div>
</AdminLayout>

<script>
  import { RichTextEditor } from '../../components/admin/RichTextEditor';
  import { createRoot } from 'react-dom/client';
  import { createElement } from 'react';

  const container = document.getElementById('editor-test');
  if (container) {
    const root = createRoot(container);
    root.render(
      createElement(RichTextEditor, {
        value: '<p>Hello <strong>world</strong>!</p>',
        onChange: (html) => console.log('HTML:', html),
        placeholder: 'Type something...',
      })
    );
  }
</script>
```

**Test:**
1. Run `npm run dev`
2. Visit `http://localhost:4321/admin/test-editor`
3. Verify toolbar buttons work
4. Verify content is editable
5. Check console for onChange events

### Step 4: Clean up test page

**Delete:** `src/pages/admin/test-editor.astro`

### Step 5: Commit

```bash
git add src/components/admin/RichTextEditor.tsx src/components/admin/MenuBar.tsx
git commit -m "feat(ui): add RichTextEditor component with Tiptap

- MenuBar with formatting controls (bold, italic, headings, lists, links)
- RichTextEditor with placeholder support
- Auto-sync with external value changes
- Prose styling for editor content"
```

---

## Task 4: Signup Page API - Types (30min)

**Files:**
- Create: `workers/newsletter/src/types.ts` (extend existing)

### Step 1: Add SignupPage type

**Edit:** `workers/newsletter/src/types.ts`

Add after existing types:

```typescript
// Signup Page (Batch 4A)
export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  title: string;
  content: string;
  button_text: string;
  form_fields: string;
  theme: string;
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSignupPageRequest {
  slug: string;
  sequence_id?: string;
  title: string;
  content: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}

export interface UpdateSignupPageRequest {
  slug?: string;
  sequence_id?: string;
  title?: string;
  content?: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}
```

### Step 2: Commit

```bash
git add workers/newsletter/src/types.ts
git commit -m "feat(types): add SignupPage types for Batch 4A"
```

---

## Task 5: Signup Page API - Implementation (2h)

**Files:**
- Create: `workers/newsletter/src/routes/signup-pages.ts`
- Create: `workers/newsletter/src/__tests__/signup-pages.test.ts`
- Modify: `workers/newsletter/src/index.ts`

### Step 1: Write test for GET /api/signup-pages

**Create:** `workers/newsletter/src/__tests__/signup-pages.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Env } from '../types';

describe('Signup Pages API', () => {
  let env: Env;

  beforeEach(async () => {
    // Setup test environment
    env = getMiniflareBindings();

    // Clean database
    await env.DB.prepare('DELETE FROM signup_pages').run();
  });

  describe('GET /api/signup-pages', () => {
    it('should return empty list when no pages exist', async () => {
      const request = new Request('http://localhost/api/signup-pages', {
        headers: { 'x-api-key': 'test-key' },
      });

      const response = await handleGetSignupPages(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, data: [] });
    });

    it('should return list of pages', async () => {
      // Insert test data
      await env.DB.prepare(
        `INSERT INTO signup_pages (id, slug, title, content)
         VALUES (?, ?, ?, ?)`
      ).bind('page1', 'test-page', 'Test Page', '<p>Content</p>').run();

      const request = new Request('http://localhost/api/signup-pages', {
        headers: { 'x-api-key': 'test-key' },
      });

      const response = await handleGetSignupPages(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].slug).toBe('test-page');
    });
  });

  describe('POST /api/signup-pages', () => {
    it('should create new signup page', async () => {
      const payload = {
        slug: 'tech-weekly',
        title: '技術ニュースレター',
        content: '<p>最新の技術情報</p>',
      };

      const request = new Request('http://localhost/api/signup-pages', {
        method: 'POST',
        headers: {
          'x-api-key': 'test-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleCreateSignupPage(request, env);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.slug).toBe('tech-weekly');
      expect(data.data.id).toBeDefined();
    });

    it('should reject invalid slug', async () => {
      const payload = {
        slug: 'invalid slug!',
        title: 'Test',
        content: '<p>Test</p>',
      };

      const request = new Request('http://localhost/api/signup-pages', {
        method: 'POST',
        headers: {
          'x-api-key': 'test-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleCreateSignupPage(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject duplicate slug', async () => {
      await env.DB.prepare(
        `INSERT INTO signup_pages (id, slug, title, content)
         VALUES (?, ?, ?, ?)`
      ).bind('page1', 'existing', 'Test', '<p>Test</p>').run();

      const payload = {
        slug: 'existing',
        title: 'New Page',
        content: '<p>New</p>',
      };

      const request = new Request('http://localhost/api/signup-pages', {
        method: 'POST',
        headers: {
          'x-api-key': 'test-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleCreateSignupPage(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('already exists');
    });
  });
});
```

### Step 2: Run test to verify it fails

**Run:**
```bash
cd workers/newsletter
npm test src/__tests__/signup-pages.test.ts
```

**Expected:** FAIL - functions not defined

### Step 3: Implement signup pages routes

**Create:** `workers/newsletter/src/routes/signup-pages.ts`

```typescript
import type { Env, SignupPage, CreateSignupPageRequest, UpdateSignupPageRequest } from '../types';

// Validation
function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
    return 'Slug must be 3-50 characters, lowercase alphanumeric and hyphens only';
  }
  return null;
}

function validateContent(content: string): string | null {
  if (content.length > 51200) { // 50KB
    return 'Content must be less than 50KB';
  }
  return null;
}

// GET /api/signup-pages
export async function handleGetSignupPages(request: Request, env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE is_active = 1 ORDER BY created_at DESC'
    ).all<SignupPage>();

    return Response.json({ success: true, data: results });
  } catch (error) {
    console.error('Failed to fetch signup pages:', error);
    return Response.json(
      { success: false, error: 'Failed to fetch signup pages' },
      { status: 500 }
    );
  }
}

// GET /api/signup-pages/:id
export async function handleGetSignupPage(request: Request, env: Env, id: string): Promise<Response> {
  try {
    const page = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE id = ? AND is_active = 1'
    ).bind(id).first<SignupPage>();

    if (!page) {
      return Response.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, data: page });
  } catch (error) {
    console.error('Failed to fetch signup page:', error);
    return Response.json(
      { success: false, error: 'Failed to fetch signup page' },
      { status: 500 }
    );
  }
}

// GET /api/signup-pages/by-slug/:slug
export async function handleGetSignupPageBySlug(request: Request, env: Env, slug: string): Promise<Response> {
  try {
    const page = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE slug = ? AND is_active = 1'
    ).bind(slug).first<SignupPage>();

    if (!page) {
      return Response.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, data: page });
  } catch (error) {
    console.error('Failed to fetch signup page by slug:', error);
    return Response.json(
      { success: false, error: 'Failed to fetch signup page' },
      { status: 500 }
    );
  }
}

// POST /api/signup-pages
export async function handleCreateSignupPage(request: Request, env: Env): Promise<Response> {
  try {
    const body: CreateSignupPageRequest = await request.json();

    // Validation
    const slugError = validateSlug(body.slug);
    if (slugError) {
      return Response.json({ success: false, error: slugError }, { status: 400 });
    }

    const contentError = validateContent(body.content);
    if (contentError) {
      return Response.json({ success: false, error: contentError }, { status: 400 });
    }

    if (!body.title || body.title.trim().length === 0) {
      return Response.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    // Check for duplicate slug
    const existing = await env.DB.prepare(
      'SELECT id FROM signup_pages WHERE slug = ?'
    ).bind(body.slug).first();

    if (existing) {
      return Response.json(
        { success: false, error: 'Slug already exists' },
        { status: 400 }
      );
    }

    // Validate sequence_id if provided
    if (body.sequence_id) {
      const sequence = await env.DB.prepare(
        'SELECT id FROM sequences WHERE id = ?'
      ).bind(body.sequence_id).first();

      if (!sequence) {
        return Response.json(
          { success: false, error: 'Invalid sequence_id' },
          { status: 400 }
        );
      }
    }

    // Create page
    const id = `page_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO signup_pages (
        id, slug, sequence_id, title, content, button_text, form_fields, theme,
        pending_title, pending_message, confirmed_title, confirmed_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.slug,
      body.sequence_id || null,
      body.title,
      body.content,
      body.button_text || '登録する',
      body.form_fields || 'email,name',
      body.theme || 'default',
      body.pending_title || '確認メールを送信しました',
      body.pending_message || 'メール内のリンクをクリックして登録を完了してください。',
      body.confirmed_title || '登録が完了しました',
      body.confirmed_message || 'ニュースレターへのご登録ありがとうございます。',
      now,
      now
    ).run();

    const page = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE id = ?'
    ).bind(id).first<SignupPage>();

    return Response.json({ success: true, data: page }, { status: 201 });
  } catch (error) {
    console.error('Failed to create signup page:', error);
    return Response.json(
      { success: false, error: 'Failed to create signup page' },
      { status: 500 }
    );
  }
}

// PUT /api/signup-pages/:id
export async function handleUpdateSignupPage(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  try {
    const body: UpdateSignupPageRequest = await request.json();

    // Check page exists
    const existing = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE id = ? AND is_active = 1'
    ).bind(id).first<SignupPage>();

    if (!existing) {
      return Response.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    // Validation
    if (body.slug) {
      const slugError = validateSlug(body.slug);
      if (slugError) {
        return Response.json({ success: false, error: slugError }, { status: 400 });
      }

      // Check for duplicate slug (excluding current page)
      const duplicate = await env.DB.prepare(
        'SELECT id FROM signup_pages WHERE slug = ? AND id != ?'
      ).bind(body.slug, id).first();

      if (duplicate) {
        return Response.json(
          { success: false, error: 'Slug already exists' },
          { status: 400 }
        );
      }
    }

    if (body.content) {
      const contentError = validateContent(body.content);
      if (contentError) {
        return Response.json({ success: false, error: contentError }, { status: 400 });
      }
    }

    if (body.sequence_id) {
      const sequence = await env.DB.prepare(
        'SELECT id FROM sequences WHERE id = ?'
      ).bind(body.sequence_id).first();

      if (!sequence) {
        return Response.json(
          { success: false, error: 'Invalid sequence_id' },
          { status: 400 }
        );
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (body.slug !== undefined) {
      updates.push('slug = ?');
      values.push(body.slug);
    }
    if (body.sequence_id !== undefined) {
      updates.push('sequence_id = ?');
      values.push(body.sequence_id);
    }
    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      values.push(body.content);
    }
    if (body.button_text !== undefined) {
      updates.push('button_text = ?');
      values.push(body.button_text);
    }
    if (body.form_fields !== undefined) {
      updates.push('form_fields = ?');
      values.push(body.form_fields);
    }
    if (body.theme !== undefined) {
      updates.push('theme = ?');
      values.push(body.theme);
    }
    if (body.pending_title !== undefined) {
      updates.push('pending_title = ?');
      values.push(body.pending_title);
    }
    if (body.pending_message !== undefined) {
      updates.push('pending_message = ?');
      values.push(body.pending_message);
    }
    if (body.confirmed_title !== undefined) {
      updates.push('confirmed_title = ?');
      values.push(body.confirmed_title);
    }
    if (body.confirmed_message !== undefined) {
      updates.push('confirmed_message = ?');
      values.push(body.confirmed_message);
    }

    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));

    values.push(id);

    await env.DB.prepare(
      `UPDATE signup_pages SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM signup_pages WHERE id = ?'
    ).bind(id).first<SignupPage>();

    return Response.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update signup page:', error);
    return Response.json(
      { success: false, error: 'Failed to update signup page' },
      { status: 500 }
    );
  }
}

// DELETE /api/signup-pages/:id
export async function handleDeleteSignupPage(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  try {
    const existing = await env.DB.prepare(
      'SELECT id FROM signup_pages WHERE id = ? AND is_active = 1'
    ).bind(id).first();

    if (!existing) {
      return Response.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    // Soft delete
    await env.DB.prepare(
      'UPDATE signup_pages SET is_active = 0, updated_at = ? WHERE id = ?'
    ).bind(Math.floor(Date.now() / 1000), id).run();

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to delete signup page:', error);
    return Response.json(
      { success: false, error: 'Failed to delete signup page' },
      { status: 500 }
    );
  }
}
```

### Step 4: Run tests to verify they pass

**Run:**
```bash
cd workers/newsletter
npm test src/__tests__/signup-pages.test.ts
```

**Expected:** All tests PASS

### Step 5: Register routes in index.ts

**Edit:** `workers/newsletter/src/index.ts`

Add imports:
```typescript
import {
  handleGetSignupPages,
  handleGetSignupPage,
  handleGetSignupPageBySlug,
  handleCreateSignupPage,
  handleUpdateSignupPage,
  handleDeleteSignupPage,
} from './routes/signup-pages';
```

Add routes (after existing routes):
```typescript
// Signup Pages API (Batch 4A)
router.get('/api/signup-pages', authenticate, handleGetSignupPages);
router.get('/api/signup-pages/by-slug/:slug', handleGetSignupPageBySlug); // Public
router.get('/api/signup-pages/:id', authenticate, handleGetSignupPage);
router.post('/api/signup-pages', authenticate, handleCreateSignupPage);
router.put('/api/signup-pages/:id', authenticate, handleUpdateSignupPage);
router.delete('/api/signup-pages/:id', authenticate, handleDeleteSignupPage);
```

### Step 6: Test API manually with wrangler

**Run:**
```bash
cd workers/newsletter
npm run dev
```

**Test with curl:**
```bash
# Create page
curl -X POST http://localhost:8787/api/signup-pages \
  -H "x-api-key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","title":"Test Page","content":"<p>Test</p>"}'

# List pages
curl http://localhost:8787/api/signup-pages \
  -H "x-api-key: test-key"

# Get by slug
curl http://localhost:8787/api/signup-pages/by-slug/test
```

**Expected:** API responds correctly

### Step 7: Commit

```bash
git add workers/newsletter/src/routes/signup-pages.ts workers/newsletter/src/__tests__/signup-pages.test.ts workers/newsletter/src/index.ts
git commit -m "feat(api): implement signup pages CRUD API

- GET /api/signup-pages (list)
- GET /api/signup-pages/:id (get by ID)
- GET /api/signup-pages/by-slug/:slug (get by slug, public)
- POST /api/signup-pages (create)
- PUT /api/signup-pages/:id (update)
- DELETE /api/signup-pages/:id (soft delete)
- Slug validation (alphanumeric + hyphen, 3-50 chars)
- Content size limit (50KB)
- Duplicate slug prevention
- Comprehensive test coverage"
```

---

## Task 6: Admin UI - API Client (30min)

**Files:**
- Modify: `src/utils/admin-api.ts`

### Step 1: Add signup pages API client functions

**Edit:** `src/utils/admin-api.ts`

Add after existing functions:

```typescript
// Signup Pages API
export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  title: string;
  content: string;
  button_text: string;
  form_fields: string;
  theme: string;
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSignupPageData {
  slug: string;
  sequence_id?: string;
  title: string;
  content: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}

export interface UpdateSignupPageData {
  slug?: string;
  sequence_id?: string;
  title?: string;
  content?: string;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
}

export async function getSignupPages(apiKey: string): Promise<SignupPage[]> {
  const response = await fetch('/api/signup-pages', {
    headers: { 'x-api-key': apiKey },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getSignupPage(apiKey: string, id: string): Promise<SignupPage> {
  const response = await fetch(`/api/signup-pages/${id}`, {
    headers: { 'x-api-key': apiKey },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createSignupPage(
  apiKey: string,
  pageData: CreateSignupPageData
): Promise<SignupPage> {
  const response = await fetch('/api/signup-pages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pageData),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updateSignupPage(
  apiKey: string,
  id: string,
  pageData: UpdateSignupPageData
): Promise<SignupPage> {
  const response = await fetch(`/api/signup-pages/${id}`, {
    method: 'PUT',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pageData),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deleteSignupPage(apiKey: string, id: string): Promise<void> {
  const response = await fetch(`/api/signup-pages/${id}`, {
    method: 'DELETE',
    headers: { 'x-api-key': apiKey },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
}
```

### Step 2: Commit

```bash
git add src/utils/admin-api.ts
git commit -m "feat(ui): add signup pages API client functions"
```

---

## Task 7: Admin UI - Page List (1h)

**Files:**
- Create: `src/components/admin/SignupPageList.tsx`
- Create: `src/pages/admin/signup-pages/index.astro`

### Step 1: Create SignupPageList component

**Create:** `src/components/admin/SignupPageList.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { getSignupPages, deleteSignupPage, type SignupPage } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

export function SignupPageList() {
  const { apiKey } = useAuth();
  const [pages, setPages] = useState<SignupPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignupPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPages();
  }, [apiKey]);

  async function loadPages() {
    if (!apiKey) return;
    setLoading(true);
    setError(null);

    try {
      const data = await getSignupPages(apiKey);
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!apiKey || !deleteTarget) return;

    setDeleting(true);
    try {
      await deleteSignupPage(apiKey, deleteTarget.id);
      setPages(pages.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete page');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadPages}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">登録ページ管理</h1>
        <a
          href="/admin/signup-pages/new"
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
        >
          + 新規作成
        </a>
      </div>

      {pages.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">登録ページがありません</p>
          <a
            href="/admin/signup-pages/new"
            className="text-gray-800 underline hover:no-underline"
          >
            最初のページを作成
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {pages.map(page => (
            <div
              key={page.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {page.slug}
                  </h3>
                  <p className="text-gray-700 mb-2">{page.title}</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>URL: /newsletter/signup/{page.slug}</p>
                    {page.sequence_id && (
                      <p>シーケンス ID: {page.sequence_id}</p>
                    )}
                    <p>
                      作成日:{' '}
                      {new Date(page.created_at * 1000).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/admin/signup-pages/edit?id=${page.id}`}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    編集
                  </a>
                  <button
                    onClick={() => setDeleteTarget(page)}
                    className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="ページを削除"
          message={`「${deleteTarget.title}」を削除しますか？この操作は取り消せません。`}
          confirmText="削除"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          danger
        />
      )}
    </div>
  );
}
```

### Step 2: Create admin page for list

**Create:** `src/pages/admin/signup-pages/index.astro`

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { SignupPageList } from '../../../components/admin/SignupPageList';
---

<AdminLayout title="登録ページ管理">
  <SignupPageList client:load />
</AdminLayout>
```

### Step 3: Test page list

1. Run `npm run dev`
2. Visit `http://localhost:4321/admin/signup-pages`
3. Verify empty state displays
4. Use curl to create test page (from Task 5 Step 6)
5. Refresh page and verify page displays
6. Test delete functionality

### Step 4: Commit

```bash
git add src/components/admin/SignupPageList.tsx src/pages/admin/signup-pages/index.astro
git commit -m "feat(ui): add signup pages list page

- Display all signup pages with metadata
- Delete functionality with confirmation modal
- Empty state with creation link
- Responsive card layout"
```

---

## Task 8: Admin UI - Page Edit Form (2h)

**Files:**
- Create: `src/components/admin/SignupPageEditForm.tsx`
- Create: `src/pages/admin/signup-pages/edit.astro`
- Create: `src/pages/admin/signup-pages/new.astro`

### Step 1: Create SignupPageEditForm component

**Create:** `src/components/admin/SignupPageEditForm.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import {
  getSignupPage,
  createSignupPage,
  updateSignupPage,
  getSequences,
  type SignupPage,
  type Sequence,
} from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';

interface SignupPageEditFormProps {
  pageId?: string;
}

export function SignupPageEditForm({ pageId }: SignupPageEditFormProps) {
  const { apiKey } = useAuth();
  const isEditMode = Boolean(pageId);

  // Form state
  const [slug, setSlug] = useState('');
  const [sequenceId, setSequenceId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [buttonText, setButtonText] = useState('登録する');
  const [formFields, setFormFields] = useState('email,name');
  const [theme, setTheme] = useState('default');
  const [pendingTitle, setPendingTitle] = useState('確認メールを送信しました');
  const [pendingMessage, setPendingMessage] = useState(
    'メール内のリンクをクリックして登録を完了してください。'
  );
  const [confirmedTitle, setConfirmedTitle] = useState('登録が完了しました');
  const [confirmedMessage, setConfirmedMessage] = useState(
    'ニュースレターへのご登録ありがとうございます。'
  );

  // UI state
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sequences
  useEffect(() => {
    if (apiKey) {
      loadSequences();
    }
  }, [apiKey]);

  // Load page data if editing
  useEffect(() => {
    if (apiKey && pageId) {
      loadPage();
    }
  }, [apiKey, pageId]);

  async function loadSequences() {
    if (!apiKey) return;
    try {
      const data = await getSequences(apiKey);
      setSequences(data);
    } catch (err) {
      console.error('Failed to load sequences:', err);
    }
  }

  async function loadPage() {
    if (!apiKey || !pageId) return;
    setLoading(true);
    setError(null);

    try {
      const data = await getSignupPage(apiKey, pageId);
      setSlug(data.slug);
      setSequenceId(data.sequence_id || '');
      setTitle(data.title);
      setContent(data.content);
      setButtonText(data.button_text);
      setFormFields(data.form_fields);
      setTheme(data.theme);
      setPendingTitle(data.pending_title);
      setPendingMessage(data.pending_message);
      setConfirmedTitle(data.confirmed_title);
      setConfirmedMessage(data.confirmed_message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey) return;

    setSaving(true);
    setError(null);

    try {
      const pageData = {
        slug,
        sequence_id: sequenceId || undefined,
        title,
        content,
        button_text: buttonText,
        form_fields: formFields,
        theme,
        pending_title: pendingTitle,
        pending_message: pendingMessage,
        confirmed_title: confirmedTitle,
        confirmed_message: confirmedMessage,
      };

      if (isEditMode && pageId) {
        await updateSignupPage(apiKey, pageId, pageData);
      } else {
        await createSignupPage(apiKey, pageData);
      }

      window.location.href = '/admin/signup-pages';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save page');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEditMode ? 'ページを編集' : '新しいページを作成'}
      </h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">基本設定</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                URL（スラッグ） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]{3,50}"
                placeholder="tech-weekly"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
              <p className="mt-1 text-sm text-gray-500">
                英小文字、数字、ハイフンのみ（3〜50文字）
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                シーケンス
              </label>
              <select
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              >
                <option value="">（シーケンスなし）</option>
                {sequences.map((seq) => (
                  <option key={seq.id} value={seq.id}>
                    {seq.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                テーマ
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              >
                <option value="default">サイトデフォルト</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                フォーム項目
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formFields.includes('email')}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        // Email is always required
                        return;
                      }
                    }}
                    disabled
                    className="mr-2"
                  />
                  メール（必須）
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formFields.includes('name')}
                    onChange={(e) => {
                      setFormFields(e.target.checked ? 'email,name' : 'email');
                    }}
                    className="mr-2"
                  />
                  名前
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ページ内容
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="技術ニュースレター登録"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                本文 <span className="text-red-500">*</span>
              </label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="ページの説明を入力してください..."
              />
            </div>
          </div>
        </div>

        {/* Button Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ボタン設定
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ボタンテキスト
            </label>
            <input
              type="text"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="登録する"
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
            />
          </div>
        </div>

        {/* Pending Page Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            仮登録ページ設定
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                タイトル
              </label>
              <input
                type="text"
                value={pendingTitle}
                onChange={(e) => setPendingTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                メッセージ
              </label>
              <textarea
                value={pendingMessage}
                onChange={(e) => setPendingMessage(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Confirmed Page Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            完了ページ設定
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                タイトル
              </label>
              <input
                type="text"
                value={confirmedTitle}
                onChange={(e) => setConfirmedTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                メッセージ
              </label>
              <textarea
                value={confirmedMessage}
                onChange={(e) => setConfirmedMessage(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <a
            href="/admin/signup-pages"
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            キャンセル
          </a>
        </div>
      </form>
    </div>
  );
}
```

### Step 2: Create edit page

**Create:** `src/pages/admin/signup-pages/edit.astro`

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { SignupPageEditForm } from '../../../components/admin/SignupPageEditForm';

const url = new URL(Astro.request.url);
const pageId = url.searchParams.get('id');

if (!pageId) {
  return Astro.redirect('/admin/signup-pages');
}
---

<AdminLayout title="ページを編集">
  <SignupPageEditForm client:load pageId={pageId} />
</AdminLayout>
```

### Step 3: Create new page

**Create:** `src/pages/admin/signup-pages/new.astro`

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { SignupPageEditForm } from '../../../components/admin/SignupPageEditForm';
---

<AdminLayout title="新しいページを作成">
  <SignupPageEditForm client:load />
</AdminLayout>
```

### Step 4: Test form functionality

1. Run `npm run dev`
2. Visit `/admin/signup-pages/new`
3. Fill out form with test data
4. Verify RichTextEditor works
5. Submit and verify redirect to list
6. Click edit on created page
7. Verify data loads correctly
8. Make changes and save

### Step 5: Commit

```bash
git add src/components/admin/SignupPageEditForm.tsx src/pages/admin/signup-pages/edit.astro src/pages/admin/signup-pages/new.astro
git commit -m "feat(ui): add signup page edit form

- Create/edit form with all customization fields
- RichTextEditor integration for page content
- Sequence selection dropdown
- Form fields selection (email/name)
- Pending and confirmed page customization
- Form validation and error handling"
```

---

## Task 9: Public Signup Pages (2h)

**Files:**
- Create: `src/pages/newsletter/signup/[slug].astro`
- Create: `src/pages/newsletter/signup/[slug]/pending.astro`
- Create: `src/pages/newsletter/signup/[slug]/confirmed.astro`

### Step 1: Create main signup page

**Create:** `src/pages/newsletter/signup/[slug].astro`

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';

const { slug } = Astro.params;

// Fetch page config
const response = await fetch(`${Astro.url.origin}/api/signup-pages/by-slug/${slug}`);

if (!response.ok) {
  return Astro.redirect('/404');
}

const { data: page } = await response.json();

const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || '';
---

<BaseLayout title={page.title} description={page.title}>
  <section class="py-24 px-4 bg-[var(--color-bg-secondary)]">
    <div class="max-w-2xl mx-auto">
      <!-- Page Content -->
      <div class="mb-8 prose prose-lg max-w-none" set:html={page.content} />

      <!-- Signup Form -->
      <div class="bg-white rounded-lg shadow-lg p-8">
        <form id="signup-form" class="space-y-4">
          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1.5">
              メールアドレス <span class="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              class="w-full px-4 py-3 rounded border border-gray-300 focus:outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800"
              placeholder="example@email.com"
            />
          </div>

          <!-- Name (if enabled) -->
          {page.form_fields.includes('name') && (
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-1.5">
                お名前 <span class="text-gray-500 text-xs">(任意)</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                class="w-full px-4 py-3 rounded border border-gray-300 focus:outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800"
                placeholder="山田 太郎"
              />
            </div>
          )}

          <!-- Turnstile Widget -->
          <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="light"></div>

          <!-- Submit Button -->
          <div>
            <button
              type="submit"
              id="submit-btn"
              class="w-full bg-gray-800 text-white px-6 py-3 rounded font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span id="btn-text">{page.button_text}</span>
              <svg id="btn-spinner" class="hidden animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </button>
          </div>
        </form>

        <!-- Status Messages -->
        <div id="status" class="mt-4 hidden">
          <div id="success" class="hidden p-4 rounded bg-green-50 border border-green-200 text-green-800 text-sm" />
          <div id="error" class="hidden p-4 rounded bg-red-50 border border-red-200 text-red-800 text-sm" />
        </div>
      </div>
    </div>
  </section>
</BaseLayout>

<!-- Turnstile Script -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<script define:vars={{ slug, sequenceId: page.sequence_id }}>
  const form = document.getElementById('signup-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');
  const formStatus = document.getElementById('status');
  const successMessage = document.getElementById('success');
  const errorMessage = document.getElementById('error');

  function setLoading(loading) {
    submitBtn.disabled = loading;
    btnText.textContent = loading ? '登録中...' : btnText.textContent;
    btnSpinner.classList.toggle('hidden', !loading);
  }

  function showStatus(type, message) {
    formStatus.classList.remove('hidden');
    successMessage.classList.toggle('hidden', type !== 'success');
    errorMessage.classList.toggle('hidden', type !== 'error');
    if (message) {
      (type === 'success' ? successMessage : errorMessage).textContent = message;
    }
  }

  function hideStatus() {
    formStatus.classList.add('hidden');
    successMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus();

    const turnstileInput = form.querySelector('input[name="cf-turnstile-response"]');
    const turnstileToken = turnstileInput?.value;

    if (!turnstileToken) {
      showStatus('error', 'セキュリティ検証を完了してください');
      return;
    }

    setLoading(true);

    const formData = new FormData(form);
    const data = {
      email: formData.get('email'),
      name: formData.get('name') || undefined,
      turnstileToken,
      sequenceId: sequenceId || undefined,
    };

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        window.location.href = `/newsletter/signup/${slug}/pending`;
      } else {
        showStatus('error', result.error || '登録に失敗しました');
      }
    } catch (error) {
      console.error('Signup error:', error);
      showStatus('error', '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  });
</script>
```

### Step 2: Create pending page

**Create:** `src/pages/newsletter/signup/[slug]/pending.astro`

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';

const { slug } = Astro.params;

// Fetch page config
const response = await fetch(`${Astro.url.origin}/api/signup-pages/by-slug/${slug}`);

if (!response.ok) {
  return Astro.redirect('/404');
}

const { data: page } = await response.json();
---

<BaseLayout title={page.pending_title} description={page.pending_message}>
  <section class="py-24 px-4 bg-[var(--color-bg-secondary)]">
    <div class="max-w-lg mx-auto text-center">
      <!-- Icon -->
      <div class="mb-8">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100">
          <svg class="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>

      <!-- Title -->
      <h1 class="text-3xl font-bold text-gray-900 mb-4">
        {page.pending_title}
      </h1>

      <!-- Message -->
      <p class="text-gray-700 mb-8 leading-relaxed">
        {page.pending_message}
      </p>

      <!-- Back to Home -->
      <a
        href="/"
        class="inline-block bg-gray-800 text-white px-6 py-3 rounded font-medium hover:bg-gray-700 transition-colors"
      >
        トップページへ戻る
      </a>
    </div>
  </section>
</BaseLayout>
```

### Step 3: Create confirmed page

**Create:** `src/pages/newsletter/signup/[slug]/confirmed.astro`

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';

const { slug } = Astro.params;

// Fetch page config
const response = await fetch(`${Astro.url.origin}/api/signup-pages/by-slug/${slug}`);

if (!response.ok) {
  return Astro.redirect('/404');
}

const { data: page } = await response.json();
---

<BaseLayout title={page.confirmed_title} description={page.confirmed_message}>
  <section class="py-24 px-4 bg-[var(--color-bg-secondary)]">
    <div class="max-w-lg mx-auto text-center">
      <!-- Icon -->
      <div class="mb-8">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
          <svg class="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
      </div>

      <!-- Title -->
      <h1 class="text-3xl font-bold text-gray-900 mb-4">
        {page.confirmed_title}
      </h1>

      <!-- Message -->
      <p class="text-gray-700 mb-8 leading-relaxed">
        {page.confirmed_message}
      </p>

      <!-- Back to Home -->
      <a
        href="/"
        class="inline-block bg-gray-800 text-white px-6 py-3 rounded font-medium hover:bg-gray-700 transition-colors"
      >
        トップページへ戻る
      </a>
    </div>
  </section>
</BaseLayout>
```

### Step 4: Update subscribe API to support sequence enrollment

**Edit:** `workers/newsletter/src/routes/subscribe.ts`

Find the subscribe handler and add sequence enrollment:

```typescript
// After creating subscriber and before sending confirmation email
if (body.sequenceId) {
  // Enroll in sequence
  const enrollId = `enroll_${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO subscriber_sequences (id, subscriber_id, sequence_id, started_at)
     VALUES (?, ?, ?, ?)`
  ).bind(enrollId, id, body.sequenceId, now).run();
}
```

Also add `sequenceId?: string` to the request type.

### Step 5: Test public pages

1. Create a test page via admin UI
2. Visit `/newsletter/signup/test`
3. Verify page content displays correctly
4. Submit form and verify redirect to pending page
5. Check pending page displays custom title/message
6. Use confirm link from email to verify confirmed page

### Step 6: Commit

```bash
git add src/pages/newsletter/signup/ workers/newsletter/src/routes/subscribe.ts
git commit -m "feat(pages): add dynamic signup pages with custom URLs

- Main signup page with rich content display
- Pending page with customizable message
- Confirmed page with customizable message
- Sequence enrollment on signup
- Turnstile spam protection
- Form field customization (email/name)"
```

---

## Task 10: Update Campaign/Sequence Email Editing (1.5h)

**Files:**
- Modify: `src/components/admin/CampaignForm.tsx`
- Modify: `src/components/admin/SequenceStepEditor.tsx`

### Step 1: Update CampaignForm to use RichTextEditor

**Edit:** `src/components/admin/CampaignForm.tsx`

Find the content textarea and replace with:

```tsx
import { RichTextEditor } from './RichTextEditor';

// ... in the form JSX:

<div>
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    本文 <span className="text-red-500">*</span>
  </label>
  <RichTextEditor
    value={content}
    onChange={setContent}
    placeholder="メール本文を入力してください..."
  />
</div>
```

### Step 2: Update SequenceStepEditor to use RichTextEditor

**Edit:** `src/components/admin/SequenceStepEditor.tsx`

Same change - find content textarea and replace with RichTextEditor:

```tsx
import { RichTextEditor } from './RichTextEditor';

// ... in the form JSX:

<div>
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    本文 <span className="text-red-500">*</span>
  </label>
  <RichTextEditor
    value={step.content}
    onChange={(html) => updateStep(index, 'content', html)}
    placeholder="ステップのメール本文を入力してください..."
  />
</div>
```

### Step 3: Test existing campaign/sequence editing

1. Visit `/admin/campaigns/new`
2. Verify RichTextEditor appears for content
3. Test formatting toolbar
4. Create campaign and verify HTML is saved
5. Edit existing campaign and verify plain text loads correctly
6. Repeat for sequences

### Step 4: Commit

```bash
git add src/components/admin/CampaignForm.tsx src/components/admin/SequenceStepEditor.tsx
git commit -m "feat(ui): replace email content textareas with RichTextEditor

- Campaign editor now uses rich text
- Sequence step editor now uses rich text
- Existing plain text content loads correctly
- Line breaks and formatting preserved"
```

---

## Task 11: Preview Modal (1h)

**Files:**
- Create: `src/components/admin/PreviewModal.tsx`
- Modify: `src/components/admin/SignupPageEditForm.tsx`

### Step 1: Create PreviewModal component

**Create:** `src/components/admin/PreviewModal.tsx`

```tsx
import { useEffect } from 'react';

interface PreviewModalProps {
  title: string;
  content: string;
  buttonText: string;
  formFields: string;
  onClose: () => void;
}

export function PreviewModal({
  title,
  content,
  buttonText,
  formFields,
  onClose,
}: PreviewModalProps) {
  // Close on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">プレビュー</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-8">
            <div
              className="prose prose-lg max-w-none mb-8"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>

          {/* Form Preview */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  メールアドレス <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  disabled
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 rounded border border-gray-300 bg-white"
                />
              </div>

              {/* Name (if enabled) */}
              {formFields.includes('name') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    お名前 <span className="text-gray-500 text-xs">(任意)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="山田 太郎"
                    className="w-full px-4 py-3 rounded border border-gray-300 bg-white"
                  />
                </div>
              )}

              {/* Submit Button */}
              <div>
                <button
                  disabled
                  className="w-full bg-gray-800 text-white px-6 py-3 rounded font-medium"
                >
                  {buttonText}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Add preview button to SignupPageEditForm

**Edit:** `src/components/admin/SignupPageEditForm.tsx`

Add state:
```tsx
const [showPreview, setShowPreview] = useState(false);
```

Add import:
```tsx
import { PreviewModal } from './PreviewModal';
```

Update actions section:
```tsx
{/* Actions */}
<div className="flex gap-4">
  <button
    type="button"
    onClick={() => setShowPreview(true)}
    className="px-6 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
  >
    プレビュー
  </button>
  <button
    type="submit"
    disabled={saving}
    className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {saving ? '保存中...' : '保存'}
  </button>
  <a
    href="/admin/signup-pages"
    className="px-6 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
  >
    キャンセル
  </a>
</div>

{/* Preview Modal */}
{showPreview && (
  <PreviewModal
    title={title}
    content={content}
    buttonText={buttonText}
    formFields={formFields}
    onClose={() => setShowPreview(false)}
  />
)}
```

### Step 3: Test preview functionality

1. Visit `/admin/signup-pages/new`
2. Fill out form with sample content
3. Click "プレビュー" button
4. Verify modal displays with formatted content
5. Verify form fields match selection
6. Test close button and Escape key
7. Verify preview updates when content changes

### Step 4: Commit

```bash
git add src/components/admin/PreviewModal.tsx src/components/admin/SignupPageEditForm.tsx
git commit -m "feat(ui): add preview modal for signup pages

- Modal preview of signup page
- Displays formatted content
- Shows form fields based on selection
- Close on button click or Escape key"
```

---

## Task 12: Deploy & Testing (30min)

### Step 1: Apply D1 migration to production

**Run:**
```bash
cd workers/newsletter
npm run db:migrate:prod
```

**Expected:** Migration applied to production D1

### Step 2: Deploy worker

**Run:**
```bash
cd workers/newsletter
npm run deploy
```

**Expected:** Worker deployed successfully

### Step 3: Deploy pages

**Run:**
```bash
npm run build
npx wrangler pages deploy dist --project-name edgeshift
```

**Expected:** Pages deployed successfully

### Step 4: End-to-end testing

**Test checklist:**

1. **Admin UI:**
   - [ ] Login to admin
   - [ ] Navigate to /admin/signup-pages
   - [ ] Create new page
   - [ ] Verify RichTextEditor works
   - [ ] Preview page
   - [ ] Save page
   - [ ] Edit existing page
   - [ ] Delete page

2. **Public Pages:**
   - [ ] Visit /newsletter/signup/{slug}
   - [ ] Verify content displays correctly
   - [ ] Submit form
   - [ ] Verify redirect to pending page
   - [ ] Confirm via email link
   - [ ] Verify confirmed page displays

3. **Email Editing:**
   - [ ] Create campaign with RichTextEditor
   - [ ] Edit existing campaign (verify plain text loads)
   - [ ] Create sequence with RichTextEditor
   - [ ] Send test email and verify formatting

4. **Integration:**
   - [ ] Signup via custom page enrolls in sequence
   - [ ] Sequence emails are sent with HTML formatting
   - [ ] Campaign emails display HTML correctly

### Step 5: Final commit

```bash
git add -A
git commit -m "feat: Batch 4A complete - signup page generation system

Complete implementation:
- Database: signup_pages table
- API: Full CRUD for signup pages
- UI: Admin list, create, edit with RichTextEditor
- Public: Dynamic signup pages with custom URLs
- Integration: Sequence enrollment, email formatting
- Testing: All features verified

Total: ~12 hours as estimated"
```

### Step 6: Push to remote

```bash
git push origin main
```

---

## Summary

**Implementation Complete:**
- ✅ Database extension (signup_pages table)
- ✅ Tiptap rich text editor integration
- ✅ Signup pages CRUD API
- ✅ Admin UI (list, create, edit)
- ✅ Public dynamic pages (/newsletter/signup/{slug})
- ✅ Campaign/Sequence email editing update
- ✅ Preview modal
- ✅ Deployment to production

**Key Files Created/Modified:**
- 3 new tables: signup_pages
- 7 new components (RichTextEditor, MenuBar, SignupPageList, etc.)
- 5 new pages (admin list/edit/new, public signup/pending/confirmed)
- 1 new API route (signup-pages.ts)
- 2 modified components (CampaignForm, SequenceStepEditor)

**Testing Coverage:**
- Unit tests for API routes
- Manual testing for UI components
- End-to-end testing for full flow

**Next Steps:**
- Monitor for any issues in production
- Gather user feedback
- Plan Batch 4B (埋め込み機能) if needed
