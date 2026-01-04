import { useState, type FormEvent } from 'react';
import { verifyTOTP } from '../../utils/auth-api';

interface Props {
  token: string;
  email: string;
  onSuccess?: () => void;
}

export function TOTPVerifyForm({ token, email, onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const cleanCode = code.replace(/\s/g, '');
    if (!cleanCode || cleanCode.length !== 6) {
      setError('6桁のコードを入力してください');
      return;
    }

    if (!/^\d+$/.test(cleanCode)) {
      setError('数字のみを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    const result = await verifyTOTP(token, cleanCode);

    if (result.success) {
      onSuccess?.();
      // Redirect to subscriber portal
      window.location.href = '/my/';
    } else {
      setError(result.error || '認証に失敗しました。コードを確認してください。');
    }

    setLoading(false);
  };

  const handleCodeChange = (value: string) => {
    // Only allow digits, max 6 characters
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  };

  return (
    <div>
      <div className="text-center mb-6">
        <div className="mb-4">
          <svg
            className="w-12 h-12 mx-auto text-[var(--color-accent)]"
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
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          2段階認証
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
          {email}
        </p>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center">
        認証アプリに表示されている<br />
        6桁のコードを入力してください。
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <input
            type="text"
            id="code"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="w-full px-4 py-4 border border-[var(--color-border)] rounded-lg
                     text-center text-2xl font-mono tracking-widest
                     focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent
                     transition-all"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full py-3 bg-[var(--color-accent)] text-white font-medium rounded-lg
                   hover:bg-[var(--color-accent-hover)] transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '確認中...' : 'ログイン'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <a
          href="/auth/login"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          別のアカウントでログイン
        </a>
      </div>
    </div>
  );
}
