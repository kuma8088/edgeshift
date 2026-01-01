'use client';

import { clearApiKey } from '../../utils/admin-api';

export function LogoutButton() {
  const handleLogout = () => {
    clearApiKey();
    window.location.href = '/admin';
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full px-4 py-2 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] rounded-lg transition-colors"
    >
      ログアウト
    </button>
  );
}
