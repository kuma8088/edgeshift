'use client';

import { useState } from 'react';
import { getDownloadUrl } from '../../utils/shop-api';

interface DownloadSectionProps {
  productId: string;
  hasDownload: boolean;
}

export default function DownloadSection({ productId, hasDownload }: DownloadSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!hasDownload) return null;

  const handleDownload = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const url = getDownloadUrl(productId);

      // Use fetch first to check auth status before opening
      const response = await fetch(url, {
        method: 'HEAD',
        credentials: 'include',
      });

      if (response.status === 401) {
        setError('ダウンロードするにはログインが必要です。');
        return;
      }

      if (response.status === 403) {
        setError('この商品を購入する必要があります。');
        return;
      }

      if (!response.ok) {
        setError('ダウンロードに失敗しました。しばらくしてからお試しください。');
        return;
      }

      // Auth OK — open the download in a new window
      window.open(url, '_blank');
    } catch {
      setError('ネットワークエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        onClick={handleDownload}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {isLoading ? 'ダウンロード中...' : 'ダウンロード'}
      </button>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <svg
            className="w-4 h-4 mt-0.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
