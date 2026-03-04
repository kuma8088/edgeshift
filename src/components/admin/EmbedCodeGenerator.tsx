'use client';

import { useState } from 'react';

export interface EmbedCodeGeneratorProps {
  pageId: string;
  slug: string;
  embedTheme: 'light' | 'dark';
  embedSize: 'compact' | 'full';
  baseUrl?: string;
}

export function EmbedCodeGenerator({
  slug,
  embedTheme,
  embedSize,
  baseUrl = (import.meta.env.SITE || 'https://edgeshift.tech/').replace(/\/$/, ''),
}: EmbedCodeGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(embedTheme);
  const [previewSize, setPreviewSize] = useState(embedSize);

  // Generate iframe code
  const getIframeWidth = (size: 'compact' | 'full'): number => {
    return size === 'compact' ? 300 : 600;
  };

  const getIframeHeight = (size: 'compact' | 'full'): number => {
    return size === 'compact' ? 400 : 500;
  };

  const iframeCode = `<iframe
  src="${baseUrl}/newsletter/embed/${slug}?theme=${embedTheme}&size=${embedSize}"
  width="${getIframeWidth(embedSize)}"
  height="${getIframeHeight(embedSize)}"
  style="border: none; border-radius: 8px;"
  title="Newsletter Signup"
></iframe>`;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">埋め込みコード</h3>

      {/* Information section */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">使い方</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>iframe コードをコピーして、任意の HTML ページに貼り付けてください</li>
          <li>テーマは <code className="px-1 py-0.5 bg-blue-100 rounded">?theme=light</code> または <code className="px-1 py-0.5 bg-blue-100 rounded">?theme=dark</code> で変更可能</li>
          <li>サイズは <code className="px-1 py-0.5 bg-blue-100 rounded">?size=compact</code> または <code className="px-1 py-0.5 bg-blue-100 rounded">?size=full</code> で変更可能</li>
          <li>すべてのモダンブラウザで動作します（IE 11 以上）</li>
        </ul>
      </div>

      {/* Embed code */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          埋め込みコード
        </label>
        <div className="relative">
          <pre className="p-4 bg-gray-50 border border-gray-300 rounded overflow-x-auto text-sm">
            <code>{iframeCode}</code>
          </pre>
          <button
            type="button"
            onClick={() => handleCopy(iframeCode)}
            className="absolute top-2 right-2 px-3 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 transition-colors"
            aria-live="polite"
          >
            {copied ? 'コピーしました！' : 'コピー'}
          </button>
        </div>
      </div>

      {/* Preview section */}
      <div className="mt-6 border-t border-gray-200 pt-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4">プレビュー</h4>

        {/* Preview controls */}
        <div className="flex gap-4 mb-4">
          <div>
            <label htmlFor="preview-theme" className="block text-sm font-medium text-gray-700 mb-1">
              テーマ
            </label>
            <select
              id="preview-theme"
              value={previewTheme}
              onChange={(e) => setPreviewTheme(e.target.value as 'light' | 'dark')}
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label htmlFor="preview-size" className="block text-sm font-medium text-gray-700 mb-1">
              サイズ
            </label>
            <select
              id="preview-size"
              value={previewSize}
              onChange={(e) => setPreviewSize(e.target.value as 'compact' | 'full')}
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
            >
              <option value="compact">Compact (300px)</option>
              <option value="full">Full (600px)</option>
            </select>
          </div>
        </div>

        {/* Preview iframe */}
        <div className="p-6 bg-gray-100 rounded-lg flex justify-center">
          <iframe
            src={`${baseUrl}/newsletter/embed/${slug}?theme=${previewTheme}&size=${previewSize}`}
            width={getIframeWidth(previewSize)}
            height={getIframeHeight(previewSize)}
            style={{ border: 'none', borderRadius: '8px' }}
            title="Newsletter Signup Preview"
          />
        </div>

        <p className="mt-4 text-sm text-gray-500">
          プレビューは実際の埋め込み表示と同じです。テーマとサイズを変更して確認できます。
        </p>
      </div>
    </div>
  );
}
