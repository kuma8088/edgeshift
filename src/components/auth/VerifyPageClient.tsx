import { useState, useEffect } from 'react';
import { validateMagicLink, type AuthSession } from '../../utils/auth-api';
import { TOTPSetupForm } from './TOTPSetupForm';
import { TOTPVerifyForm } from './TOTPVerifyForm';

interface Props {
  token: string;
}

type Status = 'loading' | 'setup' | 'verify' | 'error';

export function VerifyPageClient({ token }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function validateToken() {
      try {
        const result = await validateMagicLink(token);

        if (!result.success || !result.data) {
          const error = result.error?.includes('expired') ? 'token_expired' : 'invalid_token';
          window.location.href = `/auth/login?error=${error}`;
          return;
        }

        setSession(result.data);
        setStatus(result.data.is_first_time ? 'setup' : 'verify');
      } catch (error) {
        console.error('Error validating magic link:', error);
        setErrorMessage('認証情報の確認中にエラーが発生しました');
        setStatus('error');
      }
    }

    validateToken();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="text-center">
        <div className="animate-pulse">
          <div className="mb-4">
            <svg
              className="w-12 h-12 mx-auto text-[var(--color-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <p className="text-[var(--color-text-secondary)]">認証情報を確認中...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center">
        <div className="mb-4">
          <svg
            className="w-12 h-12 mx-auto text-[var(--color-error)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-[var(--color-text-secondary)] mb-4">{errorMessage}</p>
        <a
          href="/auth/login"
          className="text-[var(--color-accent)] hover:underline"
        >
          ログインページに戻る
        </a>
      </div>
    );
  }

  if (status === 'setup' && session) {
    return (
      <TOTPSetupForm
        token={session.temp_token}
        email={session.email}
        qrCodeUrl={session.qr_code_url || ''}
        secret={session.totp_secret || ''}
      />
    );
  }

  if (status === 'verify' && session) {
    return (
      <TOTPVerifyForm
        token={session.temp_token}
        email={session.email}
      />
    );
  }

  return null;
}
