'use client';

import { useState, useEffect } from 'react';
import { listTags, createTag, deleteTag, type Tag } from '../../utils/admin-api';

export function TagList() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    setLoading(true);
    const result = await listTags();
    if (result.success && result.data) {
      setTags(result.data.tags);
    } else {
      setError(result.error || 'Failed to load tags');
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const result = await createTag({ name: newName.trim(), description: newDesc.trim() || undefined });
    if (result.success) {
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      loadTags();
    } else {
      alert(result.error || 'Failed to create tag');
    }
    setCreating(false);
  }

  async function handleDelete(tag: Tag) {
    if (!confirm(`「${tag.name}」を削除しますか？`)) return;
    const result = await deleteTag(tag.id);
    if (result.success) {
      loadTags();
    } else {
      alert(result.error || 'Failed to delete tag');
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">タグ管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90"
        >
          + 新規タグ
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)] space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">タグ名 *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="例: VIP"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">説明</label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="例: プレミアムユーザー"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg">
              {creating ? '作成中...' : '作成'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg">
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--color-bg-secondary)]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">タグ名</th>
              <th className="px-4 py-3 text-left text-sm font-medium">説明</th>
              <th className="px-4 py-3 text-right text-sm font-medium">購読者数</th>
              <th className="px-4 py-3 text-right text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {tags.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">タグがありません</td></tr>
            ) : tags.map((tag) => (
              <tr key={tag.id} className="hover:bg-[var(--color-bg-secondary)]">
                <td className="px-4 py-3 font-medium">{tag.name}</td>
                <td className="px-4 py-3 text-gray-600">{tag.description || '-'}</td>
                <td className="px-4 py-3 text-right">{tag.subscriber_count ?? 0}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(tag)}
                    className="text-red-600 hover:underline text-sm"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
