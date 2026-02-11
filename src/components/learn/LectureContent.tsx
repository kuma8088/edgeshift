'use client';

import DOMPurify from 'dompurify';

interface Props {
  content: string;
}

/**
 * Renders lecture HTML content.
 * Content is sourced from admin-created course materials via the premium API,
 * so it is trusted content from our own system.
 * DOMPurify is used as defense-in-depth against XSS.
 */
export function LectureContent({ content }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <div
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
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />
    </div>
  );
}
