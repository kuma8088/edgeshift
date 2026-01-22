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
    let isMounted = true;

    async function fetchUsers() {
      try {
        const result = await listMailUsers();
        if (!isMounted) return;

        if (result.success && result.data?.users) {
          setUsers(result.data.users);
        } else {
          const errorMessage = result.error || 'Failed to load mail users';
          console.error('ReplyToSelector: API error', { error: errorMessage });
          setError(errorMessage);
        }
      } catch (unexpectedError) {
        if (!isMounted) return;
        const message = unexpectedError instanceof Error
          ? unexpectedError.message
          : 'Unexpected error loading mail users';
        console.error('ReplyToSelector: Unexpected error', unexpectedError);
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchUsers();

    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return <div className="text-[var(--color-text-muted)] text-sm">読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-sm">{error}</div>;
  }

  if (users.length === 0) {
    return (
      <div className="text-[var(--color-text-muted)] text-sm">
        利用可能なメールアドレスがありません。
        <a
          href="https://admin.kuma8088.com/mailserver"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-accent)] hover:underline ml-1"
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
      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:bg-gray-100"
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
