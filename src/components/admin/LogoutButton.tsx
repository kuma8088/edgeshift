'use client';

import { clearApiKey } from '../../utils/admin-api';
import { logout as logoutApi } from '../../utils/auth-api';

export function LogoutButton() {
  const handleLogout = async () => {
    // Clear API key from localStorage
    clearApiKey();
    try {
      await logoutApi();
    } finally {
      // Always redirect, even if logoutApi fails (network error)
      window.location.href = '/auth/login';
    }
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
