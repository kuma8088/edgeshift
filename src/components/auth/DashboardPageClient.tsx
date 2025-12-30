import { useState, useEffect } from 'react';
import { getCurrentUser, type User } from '../../utils/auth-api';
import { SessionAuthProvider } from './SessionAuthProvider';
import { AdminDashboard } from './AdminDashboard';
import { SubscriberDashboard } from './SubscriberDashboard';

type Status = 'loading' | 'admin' | 'subscriber' | 'unauthorized';

export function DashboardPageClient() {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const result = await getCurrentUser();

        if (!result.success || !result.data) {
          window.location.href = '/auth/login?error=unauthorized';
          return;
        }

        setUser(result.data);
        if (result.data.role === 'owner' || result.data.role === 'admin') {
          setStatus('admin');
        } else {
          setStatus('subscriber');
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = '/auth/login?error=unauthorized';
      }
    }

    checkAuth();
  }, []);

  if (status === 'loading') {
    return (
      <div className="text-center">
        <div className="animate-pulse">
          <p className="text-[var(--color-text-secondary)]">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="text-center">
        <p className="text-[var(--color-text-secondary)] mb-4">
          ログインが必要です
        </p>
        <a
          href="/auth/login"
          className="text-[var(--color-accent)] hover:underline"
        >
          ログインページへ
        </a>
      </div>
    );
  }

  return (
    <SessionAuthProvider>
      {status === 'admin' ? <AdminDashboard /> : <SubscriberDashboard />}
    </SessionAuthProvider>
  );
}
