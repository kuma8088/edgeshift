import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { MenuBar } from './MenuBar';
import { useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Detect if text looks like Markdown
 * Checks for common Markdown patterns: headings, lists, emphasis, code blocks, etc.
 */
function isMarkdownLike(text: string): boolean {
  const patterns = [
    /^#{1,6}\s/m, // Headings: # ## ### etc.
    /^[-*+]\s/m, // Unordered lists: - * +
    /^\d+\.\s/m, // Ordered lists: 1. 2. etc.
    /\*\*[^*]+\*\*/, // Bold: **text**
    /__[^_]+__/, // Bold: __text__
    /\*[^*]+\*/, // Italic: *text*
    /_[^_]+_/, // Italic: _text_
    /^>\s/m, // Blockquote: >
    /```[\s\S]*?```/, // Code block: ```code```
    /`[^`]+`/, // Inline code: `code`
    /\[.+\]\(.+\)/, // Links: [text](url)
  ];

  return patterns.some((pattern) => pattern.test(text));
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Render editor as email preview format (540px white box on gray background) */
  emailPreviewStyle?: boolean;
  /** When true, editor is read-only */
  disabled?: boolean;
}

// Font stack optimized for Japanese + cross-platform (from email styles)
const EMAIL_FONT_FAMILY = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Hiragino Kaku Gothic ProN'",
  "'Hiragino Sans'",
  'Meiryo',
  "'Segoe UI'",
  'sans-serif',
].join(', ');

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
  emailPreviewStyle = false,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        // Exclude link from StarterKit to avoid duplication
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: emailPreviewStyle ? 'email-editor-link' : 'text-blue-600 underline',
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'email-editor-image',
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
        class: emailPreviewStyle
          ? 'email-editor-content min-h-[300px] focus:outline-none'
          : 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        // Only convert if it looks like Markdown and there's no HTML content
        const hasHtml = event.clipboardData?.types.includes('text/html');
        if (text && !hasHtml && isMarkdownLike(text)) {
          event.preventDefault();
          // Use sync mode explicitly and sanitize output to prevent XSS
          const html = marked.parse(text, { async: false });
          const sanitizedHtml = DOMPurify.sanitize(html);
          // Use the editor's insertContent for proper HTML parsing
          editor?.chain().focus().insertContent(sanitizedHtml).run();
          return true;
        }
        return false;
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (emailPreviewStyle) {
    return (
      <div className="rounded-lg overflow-hidden">
        {/* MenuBar at top - sticky when scrolling, hidden when disabled */}
        {!disabled && (
          <div className="sticky top-0 z-10 bg-white border border-gray-300 rounded-t-lg">
            <MenuBar editor={editor} />
          </div>
        )}

        {/* Email preview styled editor with scroll */}
        <div
          className={disabled ? 'rounded-lg' : 'rounded-b-lg'}
          style={{
            backgroundColor: '#f5f5f5',
            padding: '24px 16px',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          {/* White content box - matches email format */}
          <div
            style={{
              boxSizing: 'content-box', // Match email template (not Tailwind's border-box)
              backgroundColor: '#ffffff',
              maxWidth: '540px',
              margin: '0 auto',
              padding: '24px',
              borderRadius: '8px',
              fontFamily: EMAIL_FONT_FAMILY,
              fontSize: '16px',
              lineHeight: '1.5',
              letterSpacing: '0.02em',
              color: '#1e1e1e',
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Scoped styles for email editor content */}
        <style>{`
          .email-editor-content {
            font-family: ${EMAIL_FONT_FAMILY};
            font-size: 16px;
            line-height: 1.5;
            letter-spacing: 0.02em;
            color: #1e1e1e;
          }
          .email-editor-content p {
            margin: 0 0 12px 0;
          }
          .email-editor-content p:last-child {
            margin-bottom: 0;
          }
          .email-editor-content p:empty {
            min-height: 1.5em;
          }
          .email-editor-content p.is-editor-empty:first-child::before {
            color: #adb5bd;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .email-editor-content h1,
          .email-editor-content h2,
          .email-editor-content h3 {
            margin: 0 0 12px 0;
            line-height: 1.4;
            letter-spacing: 0.01em;
            font-weight: 600;
          }
          .email-editor-content h1 {
            font-size: 24px;
          }
          .email-editor-content h2 {
            font-size: 20px;
          }
          .email-editor-content h3 {
            font-size: 18px;
          }
          .email-editor-content ul,
          .email-editor-content ol {
            margin: 0 0 12px 0;
            padding-left: 16px;
          }
          .email-editor-content li {
            margin-bottom: 4px;
          }
          .email-editor-link {
            color: #7c3aed;
            text-decoration: none;
          }
          .email-editor-link:hover {
            text-decoration: underline;
          }
          .email-editor-content blockquote {
            margin: 0 0 12px 0;
            padding-left: 16px;
            border-left: 3px solid #e5e5e5;
            color: #525252;
          }
          .email-editor-content hr {
            border: none;
            border-top: 1px solid #e5e5e5;
            margin: 24px 0;
          }
          .email-editor-content strong {
            font-weight: 600;
          }
          .email-editor-content em {
            font-style: italic;
          }
          .email-editor-content code {
            background-color: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
          }
          .email-editor-content pre {
            background-color: #f5f5f5;
            padding: 12px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 0 0 12px 0;
          }
          .email-editor-content pre code {
            background-color: transparent;
            padding: 0;
          }
          .email-editor-content img,
          .email-editor-image {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 12px 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex flex-col">
      {!disabled && (
        <div className="sticky top-0 z-10 flex-shrink-0">
          <MenuBar editor={editor} />
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
