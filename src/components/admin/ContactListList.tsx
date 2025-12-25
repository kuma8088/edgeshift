'use client';

import { useState, useEffect } from 'react';
import { getContactLists, deleteContactList, type ContactList } from '../../utils/admin-api';
import { ContactListFormModal } from './ContactListFormModal';

export function ContactListList() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    setLoading(true);
    setError(null);

    try {
      const result = await getContactLists();
      if (result.success && result.data) {
        setLists(result.data.lists);
      } else {
        setError(result.error || 'Failed to load lists');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateNew() {
    setEditingList(null);
    setFormModalOpen(true);
  }

  function handleEdit(list: ContactList) {
    setEditingList(list);
    setFormModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await deleteContactList(deleteTarget.id);
      if (result.success) {
        setLists(lists.filter((l) => l.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setError(result.error || 'Failed to delete list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list');
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
          onClick={loadLists}
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
        <h1 className="text-2xl font-bold text-gray-900">Contact Lists</h1>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
        >
          + 新規作成
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">Contact List がありません</p>
          <button
            onClick={handleCreateNew}
            className="text-gray-800 underline hover:no-underline"
          >
            最初のリストを作成
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{list.name}</h3>
                  {list.description && (
                    <p className="text-gray-600 mb-2">{list.description}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    作成日: {new Date(list.created_at * 1000).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/admin/contact-lists/detail?id=${list.id}`}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    詳細
                  </a>
                  <button
                    onClick={() => handleEdit(list)}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setDeleteTarget(list)}
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

      <ContactListFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingList(null);
        }}
        onSuccess={loadLists}
        list={editingList}
      />

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">リストを削除</h2>
            <p className="text-gray-600 mb-6">
              「{deleteTarget.name}」を削除しますか？購読者自体は削除されません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                disabled={deleting}
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? '削除中...' : '削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
