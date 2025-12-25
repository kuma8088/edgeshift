'use client';

import { useState, useEffect } from 'react';
import { createContactList, updateContactList, type ContactList } from '../../utils/admin-api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  list?: ContactList | null;
}

export function ContactListFormModal({ isOpen, onClose, onSuccess, list }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description || '');
    } else {
      setName('');
      setDescription('');
    }
    setError(null);
  }, [list, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data = { name, description: description || undefined };

      const result = list
        ? await updateContactList(list.id, data)
        : await createContactList(data);

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to save list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save list');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {list ? 'リストを編集' : '新しいリストを作成'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              リスト名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              placeholder="例: Tech Blog Readers"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              rows={3}
              placeholder="このリストの用途を説明"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? '保存中...' : list ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
