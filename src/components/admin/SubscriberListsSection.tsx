'use client';

import { useState, useEffect } from 'react';
import {
  getSubscriberLists,
  getContactLists,
  addSubscriberToList,
  removeSubscriberFromList,
  type ContactList,
} from '../../utils/admin-api';

interface Props {
  subscriberId: string;
}

export function SubscriberListsSection({ subscriberId }: Props) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [allLists, setAllLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingListId, setAddingListId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, [subscriberId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [listsResult, allListsResult] = await Promise.all([
        getSubscriberLists(subscriberId),
        getContactLists(),
      ]);

      if (listsResult.success && listsResult.data) {
        setLists(listsResult.data.lists || []);
      }

      if (allListsResult.success && allListsResult.data) {
        setAllLists(allListsResult.data.lists || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFromList(listId: string) {
    setRemoving(listId);
    try {
      const result = await removeSubscriberFromList(subscriberId, listId);
      if (result.success) {
        setLists(lists.filter((l) => l.id !== listId));
      } else {
        setError(result.error || 'Failed to remove from list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from list');
    } finally {
      setRemoving(null);
    }
  }

  async function handleAddToList() {
    if (!addingListId) return;

    setAdding(true);
    setError(null);

    try {
      const result = await addSubscriberToList(subscriberId, addingListId);
      if (result.success) {
        const addedList = allLists.find((l) => l.id === addingListId);
        if (addedList) {
          setLists([...lists, addedList]);
        }
        setShowAddModal(false);
        setAddingListId('');
      } else {
        setError(result.error || 'Failed to add to list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to list');
    } finally {
      setAdding(false);
    }
  }

  const availableLists = allLists.filter(
    (list) => !lists.some((l) => l.id === list.id)
  );

  if (loading) {
    return <div className="text-center py-6 text-gray-500">Loading lists...</div>;
  }

  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">所属リスト ({lists.length})</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors text-sm"
        >
          リストに追加
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {lists.length === 0 ? (
        <p className="text-gray-500 text-center py-8">リストに所属していません</p>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <div
              key={list.id}
              className="flex justify-between items-center p-3 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">{list.name}</p>
                {list.description && (
                  <p className="text-sm text-[var(--color-text-muted)]">{list.description}</p>
                )}
              </div>
              <button
                onClick={() => handleRemoveFromList(list.id)}
                disabled={removing === list.id}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                {removing === list.id ? '削除中...' : '削除'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add to List Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">リストに追加</h3>

            {availableLists.length === 0 ? (
              <p className="text-gray-500 mb-4">追加可能なリストがありません</p>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  追加先リスト
                </label>
                <select
                  value={addingListId}
                  onChange={(e) => setAddingListId(e.target.value)}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                >
                  <option value="">リストを選択</option>
                  {availableLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddingListId('');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddToList}
                disabled={!addingListId || adding}
                className="flex-1 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
