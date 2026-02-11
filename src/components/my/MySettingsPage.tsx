'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, logout, type CurrentUser } from '../../utils/my-api';

export function MySettingsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const load = async () => {
      const result = await getCurrentUser();
      if (!result.success || !result.data) {
        window.location.href = '/auth/login?redirect=/my/settings';
        return;
      }
      setUser(result.data);
      setLoading(false);
    };
    load();
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
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-32" />
          <div className="h-4 bg-gray-100 rounded w-64" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">アカウント設定</h1>

      {/* Profile */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">プロフィール</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">メールアドレス</label>
              <div className="flex items-center gap-3">
                <p className="text-gray-900">{user.email}</p>
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">認証済み</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">ユーザーID</label>
              <p className="text-gray-900 font-mono text-sm">{user.id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">セキュリティ</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">ログイン方式</label>
              <p className="text-gray-900">マジックリンク（メール認証）</p>
              <p className="text-xs text-gray-400 mt-1">
                パスワードの代わりに、メールに送信されるログインリンクで認証します
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">二要素認証（TOTP）</label>
              <div className="flex items-center gap-3">
                {user.totp_enabled ? (
                  <>
                    <span className="flex items-center gap-1.5 text-green-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      有効
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">保護中</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    無効
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                次回ログイン時に TOTP アプリでの認証が求められます
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Session */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">セッション</h2>
          <p className="text-sm text-gray-500 mb-4">
            現在のセッションからログアウトします。再度ログインするにはマジックリンクが必要です。
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-5 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loggingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </div>
    </div>
  );
}
