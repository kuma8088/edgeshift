'use client';

import { useState, useEffect } from 'react';
import { getSignupPages, deleteSignupPage, type SignupPage } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

export function SignupPageList() {
  const [pages, setPages] = useState<SignupPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignupPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      const result = await getSignupPages();
      if (result.success && result.data) {
        setPages(result.data.pages);
      } else {
        setError(result.error || 'Failed to load pages');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await deleteSignupPage(deleteTarget.id);
      if (result.success) {
        setPages(pages.filter(p => p.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setError(result.error || 'Failed to delete page');
      }
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
