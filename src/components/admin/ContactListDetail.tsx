'use client';

import { useState, useEffect } from 'react';
import {
  getContactList,
  getListMembers,
  removeMemberFromList,
  type ContactList
} from '../../utils/admin-api';

interface Member {
  subscriber_id: string;
  email: string;
  name?: string;
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

  useEffect(() => {
    loadData();
  }, [listId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(subscriberId: string) {
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
                    <td className="py-3 px-4">{member.email}</td>
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
                      <button
                        onClick={() => handleRemoveMember(member.subscriber_id)}
                        disabled={removing === member.subscriber_id}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        {removing === member.subscriber_id ? '削除中...' : '削除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
