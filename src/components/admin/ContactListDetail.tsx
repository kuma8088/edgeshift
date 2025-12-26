'use client';

import { useState, useEffect } from 'react';
import {
  getContactList,
  getListMembers,
  removeMemberFromList,
  listSubscribers,
  updateSubscriber,
  type ContactList
} from '../../utils/admin-api';

interface Member {
  subscriber_id: string;
  email: string;
  name?: string;
  status: string;
}

interface EditingMember {
  subscriber_id: string;
  name: string;
  status: string;
}

interface Props {
  listId: string;
}

export function ContactListDetail({ listId }: Props) {
  const [list, setList] = useState<ContactList | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<EditingMember | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [listId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      if (listId === 'all') {
        // Pseudo-list: All Subscribers
        const allList: ContactList = {
          id: 'all',
          name: '全購読者',
          description: 'すべての購読者（全ステータス）',
          created_at: 0,
          updated_at: 0,
        };
        setList(allList);

        // Fetch all subscribers (all statuses)
        const subscribersResult = await listSubscribers({});
        if (subscribersResult.success && subscribersResult.data) {
          const subs = (subscribersResult.data as any).subscribers || [];
          setMembers(subs.map((s: any) => ({
            subscriber_id: s.id,
            email: s.email,
            name: s.name,
            status: s.status,
          })));
        }
      } else {
        const [listResult, membersResult] = await Promise.all([
          getContactList(listId),
          getListMembers(listId),
        ]);

        if (listResult.success && listResult.data) {
          setList(listResult.data.list);
        } else {
          setError(listResult.error || 'Failed to load list');
          return;
        }

        if (membersResult.success && membersResult.data) {
          setMembers((membersResult.data as any).members || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(subscriberId: string) {
    if (listId === 'all') {
      setError('全購読者リストからは削除できません');
      return;
    }

    setRemoving(subscriberId);
    try {
      const result = await removeMemberFromList(listId, subscriberId);
      if (result.success) {
        setMembers(members.filter((m) => m.subscriber_id !== subscriberId));
      } else {
        setError(result.error || 'Failed to remove member');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoving(null);
    }
  }

  function handleEditClick(member: Member) {
    setEditingMember({
      subscriber_id: member.subscriber_id,
      name: member.name || '',
      status: member.status,
    });
  }

  async function handleSaveEdit() {
    if (!editingMember) return;

    setSaving(true);
    try {
      const result = await updateSubscriber(editingMember.subscriber_id, {
        name: editingMember.name,
        status: editingMember.status,
      });

      if (result.success) {
        // Update local state
        setMembers(members.map((m) =>
          m.subscriber_id === editingMember.subscriber_id
            ? { ...m, name: editingMember.name, status: editingMember.status }
            : m
        ));
        setEditingMember(null);
      } else {
        setError(result.error || 'Failed to update subscriber');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subscriber');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (error || !list) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Failed to load list'}</p>
        <a href="/admin/contact-lists" className="text-gray-800 underline hover:no-underline">
          リスト一覧に戻る
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/admin/contact-lists" className="text-gray-600 hover:text-gray-900 mb-4 inline-block">
          ← リスト一覧に戻る
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{list.name}</h1>
        {list.description && (
          <p className="text-gray-600 mb-4">{list.description}</p>
        )}
        <p className="text-sm text-gray-500">
          作成日: {new Date(list.created_at * 1000).toLocaleDateString('ja-JP')}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          メンバー ({members.length})
        </h2>

        {members.length === 0 ? (
          <p className="text-gray-500 text-center py-8">メンバーがいません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Email</th>
                  <th className="text-left py-3 px-4 font-semibold">Name</th>
                  <th className="text-left py-3 px-4 font-semibold">Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.subscriber_id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <a
                        href={`/admin/subscribers/detail?id=${member.subscriber_id}`}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        {member.email}
                      </a>
                    </td>
                    <td className="py-3 px-4">{member.name || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        member.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEditClick(member)}
                          className="text-sm text-gray-700 hover:underline"
                        >
                          編集
                        </button>
                        {listId !== 'all' && (
                          <button
                            onClick={() => handleRemoveMember(member.subscriber_id)}
                            disabled={removing === member.subscriber_id}
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          >
                            {removing === member.subscriber_id ? '削除中...' : '削除'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">購読者を編集</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-800"
                  placeholder="未設定"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={editingMember.status}
                  onChange={(e) => setEditingMember({ ...editingMember, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-800"
                >
                  <option value="active">active</option>
                  <option value="unsubscribed">unsubscribed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingMember(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
