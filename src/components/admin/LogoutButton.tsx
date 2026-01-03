'use client';

import { clearApiKey } from '../../utils/admin-api';
import { logout as logoutApi } from '../../utils/auth-api';

// CF Access logout URL
const CF_ACCESS_LOGOUT_URL = 'https://kuma8088.cloudflareaccess.com/cdn-cgi/access/logout';

export function LogoutButton() {
  const handleLogout = async () => {
    // Clear API key from localStorage
    clearApiKey();
    try {
      await logoutApi();
    } finally {
      // Redirect to CF Access logout to clear CF session
      window.location.href = CF_ACCESS_LOGOUT_URL;
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
