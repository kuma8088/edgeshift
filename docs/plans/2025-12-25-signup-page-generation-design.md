# Signup Page Generation System - Design Document

**Created:** 2025-12-25
**Status:** Design Complete - Ready for Implementation
**Batch:** 4A

---

## Overview

### Purpose

Enable creation of custom signup pages for different sequences/contact lists with rich text editing capabilities.

### Key Features

- Dynamic signup page generation with custom URLs (slugs)
- Rich text editor (Tiptap) for page content and email editing
- Theme selection with site theme inheritance
- Form field customization (email only / email + name)
- Preview functionality (modal-based)
- Template-based pending/confirmed pages

### Use Cases

1. Multiple sequences with dedicated signup pages (e.g., "Tech Weekly", "AWS Beginner Series")
2. Contact list segmentation (future: Batch 4C)
3. Consistent editing experience across pages and emails

---

## Architecture

### Database Schema

#### New Table: signup_pages

```sql
CREATE TABLE IF NOT EXISTS signup_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,           -- URL: /newsletter/signup/{slug}
  sequence_id TEXT,                     -- Related sequence (nullable)
  title TEXT NOT NULL,                  -- Page title
  content TEXT NOT NULL,                -- Rich text content (HTML)
  button_text TEXT DEFAULT '登録する',   -- Submit button text
  form_fields TEXT DEFAULT 'email,name', -- 'email' or 'email,name'
  theme TEXT DEFAULT 'default',         -- Theme name

  -- Pending page settings
  pending_title TEXT DEFAULT '確認メールを送信しました',
  pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。',

  -- Confirmed page settings
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

#### Validation Rules

- `slug`: alphanumeric + hyphen, 3-50 chars, unique
- `content`: max 50KB (approx. 10,000-15,000 Japanese characters with HTML)
- `sequence_id`: nullable (for general newsletter signup without sequence enrollment)

### URL Structure

```
/newsletter/signup/{slug}              → Signup form page (dynamic)
/newsletter/signup/{slug}/pending      → Pending confirmation page (dynamic)
/newsletter/signup/{slug}/confirmed    → Registration complete page (dynamic)
```

### API Endpoints

#### Admin API (Authentication Required)

```
GET    /api/signup-pages              # List all pages
GET    /api/signup-pages/:id          # Get page by ID
POST   /api/signup-pages              # Create page
PUT    /api/signup-pages/:id          # Update page
DELETE /api/signup-pages/:id          # Delete page
```

#### Public API

```
GET    /api/signup-pages/by-slug/:slug  # Get page config by slug
```

#### Request/Response Example

```typescript
// POST/PUT /api/signup-pages
{
  slug: "tech-weekly",
  sequence_id: "seq_123",
  title: "技術ニュースレター登録",
  content: "<h1>技術ニュースレターに登録</h1><p>最新の<strong>技術情報</strong>を...</p>",
  button_text: "登録する",
  form_fields: "email,name",
  theme: "default",
  pending_title: "確認メールを送信しました",
  pending_message: "メール内のリンクを...",
  confirmed_title: "登録が完了しました",
  confirmed_message: "ご登録ありがとうございます"
}

// Response
{
  success: true,
  data: {
    id: "page_abc123",
    slug: "tech-weekly",
    url: "/newsletter/signup/tech-weekly",
    ...
  }
}
```

---

## Rich Text Editor Integration

### Technology Stack

**Library:** Tiptap v2.1.0

**Dependencies:**
```json
{
  "@tiptap/react": "^2.1.0",
  "@tiptap/starter-kit": "^2.1.0",
  "@tiptap/extension-link": "^2.1.0",
  "@tiptap/extension-placeholder": "^2.1.0"
}
```

**Supported Features:**
- Headings (H1, H2, H3)
- Bold, Italic, Underline
- Links
- Bullet/Numbered Lists
- Line breaks (properly recognized)
- Placeholder text

### Common Component

```typescript
// src/components/admin/RichTextEditor.tsx
interface RichTextEditorProps {
  value: string;           // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({ placeholder })
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    }
  });

  return (
    <div className="border rounded">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

### Application Points

1. **Signup Page Editor** (new)
   - `content` field (page body)

2. **Campaign Editor** (existing - to be updated)
   - `content` field (email body)
   - Replace current textarea with RichTextEditor

3. **Sequence Step Editor** (existing - to be updated)
   - `content` field (email body)
   - Replace current textarea with RichTextEditor

### Data Migration

Existing plain text data will remain as-is. When opened in RichTextEditor, plain text will be automatically wrapped in `<p>` tags. Line breaks will be converted to `<br>` or `</p><p>`.

---

## Admin UI Design

### Page List Screen (`/admin/signup-pages`)

```
┌─ 登録ページ管理 ─────────────────────────────────┐
│ [+ 新規作成]                                      │
│                                                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ tech-weekly                    [編集] [削除] │ │
│ │ 技術ニュースレター登録                        │ │
│ │ シーケンス: Tech Weekly Series                │ │
│ │ URL: /newsletter/signup/tech-weekly           │ │
│ │ 作成日: 2025-12-25                            │ │
│ └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### Page Edit Screen (`/admin/signup-pages/edit?id=xxx`)

**Sections:**
1. Basic Settings (slug, sequence, theme, form fields)
2. Page Content (RichTextEditor - full width)
3. Button Settings (button text)
4. Pending Page Settings (title, message - simple text fields)
5. Confirmed Page Settings (title, message - simple text fields)
6. Actions (Preview, Save, Cancel)

### Preview Functionality

**Type:** Modal-based (not real-time)

**Trigger:** "プレビュー" button

**Display:** Modal showing actual page rendering with all customizations applied

---

## Implementation Tasks

### Batch 4A Revised Breakdown

| # | Task | Details | Estimate |
|:--|:--|:--|:--|
| 4A-1 | DB Extension | Create signup_pages table, migration | 30min |
| 4A-2 | RichTextEditor Component | Tiptap integration, common component | 2h |
| 4A-3 | Signup Page API | CRUD API with validation | 2h |
| 4A-4 | Admin UI | List, edit, delete screens | 3h |
| 4A-5 | Public Page Implementation | Dynamic generation (signup/pending/confirmed) | 2h |
| 4A-6 | Existing Feature Update | Replace campaign/sequence email editing with RichTextEditor | 1.5h |
| 4A-7 | Preview Functionality | Modal preview implementation | 1h |

**Total: 12 hours** (original estimate: 5h → increased due to rich text editor integration)

### Key Files

```
workers/newsletter/
├── schema.sql (add signup_pages table)
├── src/routes/signup-pages.ts (new API)
└── src/routes/public-signup.ts (public page API)

src/
├── components/admin/
│   ├── RichTextEditor.tsx (new - common component)
│   ├── SignupPageList.tsx (new)
│   ├── SignupPageEditForm.tsx (new)
│   └── PreviewModal.tsx (new)
├── pages/
│   ├── admin/signup-pages/ (new)
│   │   ├── index.astro (list)
│   │   └── edit.astro (edit)
│   └── newsletter/signup/
│       └── [slug].astro (dynamic page)
└── utils/
    └── admin-api.ts (add signup-pages API)
```

---

## Design Decisions & Trade-offs

### 1. Flat Slug Structure (Phase 1)

**Decision:** Only alphanumeric + hyphen slugs (no `/` directory structure)

**Rationale:**
- Simplifies validation and routing
- Traffic analysis delegated to Google Analytics/Search Console
- Directory structure reserved for future features (A/B testing, detailed analytics)

**Future Extension:** Batch 4D+ may add hierarchical slugs (e.g., `series/tech-weekly`)

### 2. Modal Preview (Not Real-time)

**Decision:** Preview button → modal display (instead of side-by-side real-time preview)

**Rationale:**
- Real-time preview will be replaced by block editor in future
- Simplifies initial implementation
- Consistent with YAGNI principle for MVP

**Future Extension:** Block editor (Phase 2) will provide visual editing with integrated preview

### 3. Template-based Pending/Confirmed Pages

**Decision:** Fixed template with title/message customization only (no rich text)

**Rationale:**
- Balances flexibility and implementation cost
- Pending/confirmed pages are typically simple status displays
- Full customization available for main signup page

**Alternative Considered:** Full rich text editing for all pages (+2-3h implementation)

### 4. sequence_id Nullable

**Decision:** Allow NULL sequence_id for general newsletter signup

**Rationale:**
- Supports "newsletter without sequence enrollment" use case
- Matches existing `/newsletter/subscribe` behavior
- Enables future Contact List segmentation (Batch 4C)

**Alternative Considered:** Mandatory sequence assignment (rejected - too restrictive)

---

## Cost Implications

### Cloudflare D1 Free Tier Limits

**Free Tier:**
- Storage: 5 GB
- Reads: 5M/month
- Writes: 100K/month

**Paid Tier ($5/month):**
- Storage: 5 GB (same)
- Reads: 25M/month (5x)
- Writes: 500K/month (5x)

### Scaling Estimates

**Scenario 1:** 1,000 subscribers, 4 campaigns/month
- Writes: ~5,700/month → Well within free tier

**Scenario 2:** 10,000 subscribers, 4 campaigns/month
- Writes: ~53,000/month → Still within free tier

**Scenario 3:** 10,000 subscribers, 10 campaigns/month
- Writes: ~130,000/month → **Requires paid tier**

**Conclusion:** Free tier supports up to 10,000 subscribers with moderate campaign frequency. Paid tier ($5/month) is acceptable at scale.

---

## Future Enhancements (Out of Scope for Batch 4A)

1. **Visual Block Editor** (Phase 2)
   - Drag-and-drop blocks (heading, paragraph, button, image)
   - Reference: FunnelKit Enhanced Email Visual Builder
   - Replaces rich text editor for advanced users

2. **Hierarchical Slugs** (Batch 4D+)
   - Support directory structure: `series/tech-weekly`
   - Category-based organization

3. **Advanced Customization**
   - Color customization (accent, background)
   - Direct CSS editing
   - Custom form fields

4. **OGP & Metadata**
   - Custom OG images
   - SEO meta tags

5. **A/B Testing & Analytics**
   - Built-in conversion tracking
   - Variant testing for signup pages

---

## References

- Tiptap Documentation: https://tiptap.dev/
- FunnelKit Email Builder: https://funnelkit.com/docs/autonami-2/email-builder/enhanced-email-visual-builder/
- Cloudflare D1 Pricing: https://developers.cloudflare.com/d1/platform/pricing/

---

## Approval & Next Steps

**Design Approved:** 2025-12-25

**Next Steps:**
1. Create implementation plan using `superpowers:writing-plans`
2. Set up git worktree for isolated development
3. Begin implementation following task breakdown

---

*This design document was created through collaborative brainstorming and represents the MVP scope for Batch 4A: Signup Page Generation.*
