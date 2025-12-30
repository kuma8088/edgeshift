import { useState, type FormEvent } from 'react';
import { requestMagicLink } from '../../utils/auth-api';

interface Props {
  onSuccess?: (email: string) => void;
}

export function MagicLinkForm({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    const result = await requestMagicLink(email.trim());

    if (result.success) {
      setSent(true);
      onSuccess?.(email.trim());
    } else {
      if (result.error?.includes('Too many')) {
        setError('リクエストが多すぎます。しばらく待ってから再試行してください。');
      } else {
        setError(result.error || 'エラーが発生しました。再試行してください。');
      }
    }

    setLoading(false);
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-[var(--color-success)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
          メールを送信しました
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-4">
          <span className="font-medium">{email}</span> に<br />
          ログインリンクを送信しました。
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          メールが届かない場合は、迷惑メールフォルダを確認するか、<br />
          別のメールアドレスで再試行してください。
        </p>
        <button
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
          className="mt-6 text-[var(--color-accent)] hover:underline text-sm"
        >
          別のメールアドレスでログイン
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">ログイン</h1>
        <p className="text-[var(--color-text-secondary)] mt-2">
          メールアドレスにログインリンクを送信します
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
          >
            メールアドレス
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full px-4 py-3 border border-[var(--color-border)] rounded-lg
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
          disabled={loading}
          className="w-full py-3 bg-[var(--color-accent)] text-white font-medium rounded-lg
                   hover:bg-[var(--color-accent-hover)] transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '送信中...' : 'ログインリンクを送信'}
        </button>
      </form>
    </div>
  );
}
