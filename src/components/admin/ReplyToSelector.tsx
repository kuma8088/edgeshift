'use client';

import { useState, useEffect } from 'react';
import { listMailUsers, type MailUser } from '../../utils/admin-api';

interface ReplyToSelectorProps {
  value: string | null;
  onChange: (email: string | null) => void;
  disabled?: boolean;
}

export function ReplyToSelector({ value, onChange, disabled = false }: ReplyToSelectorProps) {
  const [users, setUsers] = useState<MailUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchUsers() {
      const result = await listMailUsers();
      if (result.success && result.data) {
        setUsers(result.data.users);
      } else {
        setError(result.error || 'Failed to load mail users');
      }
      setLoading(false);
    }
    fetchUsers();
  }, []);

  if (loading) {
    return <div className="text-gray-500 text-sm">読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-sm">{error}</div>;
  }

  if (users.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        利用可能なメールアドレスがありません。
        <a
          href="https://admin.kuma8088.com/mailserver"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:underline ml-1"
        >
          メールサーバーで追加
        </a>
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
    >
      <option value="">デフォルト（環境変数）</option>
      {users.map((user) => (
        <option key={user.id} value={user.email}>
          {user.email}
        </option>
      ))}
    </select>
  );
}
