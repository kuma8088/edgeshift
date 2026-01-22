# Empty Paragraph Fix Design

## Date
2026-01-22

## Problem

TipTap editor outputs `<p></p>` for empty paragraphs, which renders with zero height in email clients. This causes visual line breaks to disappear in sent emails.

### Previous Attempt (d8fcb13) and Its Side Effect

The previous fix transformed `<p></p>` to `<p><br></p>` in `onUpdate`:

```typescript
onUpdate: ({ editor }) => {
  const html = processEmptyParagraphs(editor.getHTML());
  onChange(html);
}
```

This caused a cursor jump bug because:
1. `onUpdate` transforms HTML before calling `onChange`
2. Parent component updates `value` with transformed HTML
3. `useEffect` compares `value` (transformed) with `editor.getHTML()` (raw)
4. They don't match, so `setContent` is called
5. `setContent` resets cursor position

## Solution: CSS + Send-time Transformation

### Approach

1. **Editor display**: Use CSS `p:empty` to give empty paragraphs visual height
2. **Email sending**: Transform `<p></p>` to `<p><br></p>` in template processing

### Benefits

- No modification to editor's data flow (no cursor jump)
- Consistent appearance: edit view = preview = sent email
- Simple, isolated changes

## Implementation

### 1. CSS for Editor Display

**File:** `src/components/admin/RichTextEditor.tsx`

```css
.email-editor-content p:empty {
  min-height: 1.5em;
}
```

### 2. Send-time Transformation

**File:** `workers/newsletter/src/lib/templates/index.ts`

```typescript
function processEmptyParagraphs(html: string): string {
  return html.replace(/<p><\/p>/g, '<p><br></p>');
}
```

Applied in `renderEmail()` after `linkifyUrls()`.

## Testing

1. **Editor**: Type "Hello", Enter, Enter, "World" - empty line should be visible
2. **Cursor**: Cursor should NOT jump to end after pressing Enter
3. **Send**: Send test email, verify empty lines appear in email client
