'use client';

import { useState, useEffect } from 'react';
import {
  listTags,
  getSubscriberTags,
  addSubscriberTag,
  removeSubscriberTag,
  type Tag,
} from '../../utils/admin-api';

interface Props {
  subscriberId: string;
}

export function SubscriberTagSection({ subscriberId }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [subscriberTags, setSubscriberTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => { loadData(); }, [subscriberId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    const [allResult, subResult] = await Promise.all([
      listTags(),
      getSubscriberTags(subscriberId),
    ]);
    if (allResult.success && allResult.data) setAllTags(allResult.data.tags);
    if (subResult.success && subResult.data) setSubscriberTags(subResult.data.tags);
    if (!allResult.success || !subResult.success) {
      setError('タグの読み込みに失敗しました');
    }
    setLoading(false);
  }

  async function handleAddTag(tagId: string) {
    const result = await addSubscriberTag(subscriberId, { tag_id: tagId });
    if (result.success) {
      setShowDropdown(false);
      loadData();
    } else {
      alert(result.error || 'タグの追加に失敗しました');
    }
  }

  async function handleCreateAndAdd() {
    if (!newTagName.trim()) return;
    const result = await addSubscriberTag(subscriberId, { tag_name: newTagName.trim() });
    if (result.success) {
      setNewTagName('');
      setShowDropdown(false);
      loadData();
    } else {
      alert(result.error || 'タグの作成に失敗しました');
    }
  }

  async function handleRemoveTag(tagId: string) {
    const result = await removeSubscriberTag(subscriberId, tagId);
    if (result.success) {
      loadData();
    } else {
      alert(result.error || 'タグの削除に失敗しました');
    }
  }

  const subscriberTagIds = new Set(subscriberTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !subscriberTagIds.has(t.id));

  if (loading) return <div className="text-gray-500">Loading tags...</div>;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-[var(--color-text)]">タグ</h3>

      <div className="flex flex-wrap gap-2">
        {subscriberTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="ml-1 hover:text-blue-600"
            >
              ×
            </button>
          </span>
        ))}
        {subscriberTags.length === 0 && (
          <span className="text-gray-500 text-sm">タグなし</span>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50"
        >
          + タグを追加
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-10">
            <div className="p-2 border-b">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新規タグ名..."
                className="w-full px-2 py-1 text-sm border rounded"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAdd()}
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  {tag.name}
                </button>
              ))}
              {newTagName.trim() && (
                <button
                  onClick={handleCreateAndAdd}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                >
                  + 「{newTagName}」を作成して追加
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
