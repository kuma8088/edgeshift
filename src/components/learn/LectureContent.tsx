'use client';

import { useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

interface Props {
  content: string;
}

/** Detect if content is HTML (from RichTextEditor) or Markdown */
function isHtmlContent(text: string): boolean {
  return /<(?:p|h[1-6]|div|ul|ol|table|blockquote)[\s>]/i.test(text);
}

/**
 * Renders lecture content with HTML and Markdown support.
 * Content is sourced from admin-created course materials via the premium API,
 * so it is trusted content from our own system.
 * DOMPurify is used as defense-in-depth against XSS.
 */
export function LectureContent({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitizedHtml = useMemo(() => {
    const html = isHtmlContent(content)
      ? content
      : marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(html);
  }, [content]);

  // Apply syntax highlighting to code blocks after render
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [sanitizedHtml]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Content is admin-created via RichTextEditor or Markdown; DOMPurify sanitizes as defense-in-depth */}
      <div
        ref={containerRef}
        className="prose prose-gray max-w-none
          prose-headings:text-gray-900 prose-headings:font-semibold
          prose-p:text-gray-700 prose-p:leading-relaxed
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg
          prose-img:rounded-lg prose-img:shadow-sm
          prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:rounded-r-lg prose-blockquote:py-1
          prose-li:text-gray-700
          prose-table:text-sm
          prose-th:bg-gray-50 prose-th:font-semibold
          prose-td:border-gray-200"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}
