'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, logout, type CurrentUser } from '../../utils/my-api';

export function Dashboard() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
      } else {
        // Not authenticated, redirect to login
        window.location.href = '/auth/login';
        return;
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    const result = await logout();
    if (result.success) {
      window.location.href = '/auth/login';
    } else {
      setLoggingOut(false);
      alert('ログアウトに失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Card */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-8 border border-[var(--color-border)]">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">マイページ</h1>
        <p className="text-[var(--color-text-secondary)]">
          こんにちは、<span className="font-medium text-[var(--color-text)]">{user.email}</span> さん
        </p>
      </div>

      {/* Logout Button */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="px-6 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--color-border)]"
        >
          {loggingOut ? 'ログアウト中...' : 'ログアウト'}
        </button>
      </div>
    </div>
  );
}
