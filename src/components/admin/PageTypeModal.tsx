'use client';

import { type PageType } from '../../utils/admin-api';

interface PageTypeModalProps {
  isOpen: boolean;
  onSelect: (pageType: PageType) => void;
  onCancel: () => void;
}

export function PageTypeModal({ isOpen, onSelect, onCancel }: PageTypeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            ページタイプを選択
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {/* Landing Page Option */}
          <button
            onClick={() => onSelect('landing')}
            className="w-full text-left p-6 border-2 border-gray-200 rounded-lg hover:border-gray-800 hover:bg-gray-50 transition-all group"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  ランディングページ
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  確認フローを含む独立したページです。専用URLでアクセスでき、登録後の確認待ちページと完了ページを表示します。
                </p>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>✓ URL: /newsletter/signup/[slug]</p>
                  <p>✓ 確認メール送信フロー</p>
                  <p>✓ カスタム確認待ち・完了ページ</p>
                </div>
              </div>
            </div>
          </button>

          {/* Embed Page Option */}
          <button
            onClick={() => onSelect('embed')}
            className="w-full text-left p-6 border-2 border-gray-200 rounded-lg hover:border-gray-800 hover:bg-gray-50 transition-all group"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  埋め込みページ
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  iframe で他のサイトに埋め込み可能なコンパクトフォームです。既存のウェブサイトやブログに設置できます。
                </p>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>✓ URL: /newsletter/embed/[slug]</p>
                  <p>✓ iframe 埋め込みコード生成</p>
                  <p>✓ ライト/ダークテーマ対応</p>
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
