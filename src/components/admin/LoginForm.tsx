import { useState, type FormEvent } from 'react';

interface LoginFormProps {
  onLogin: (apiKey: string) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API キーを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    const success = await onLogin(apiKey.trim());
    if (!success) {
      setError('認証に失敗しました。API キーを確認してください。');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-tertiary)] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">EdgeShift Admin</h1>
            <p className="text-[var(--color-text-secondary)] mt-2">管理画面にログイン</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label
                htmlFor="apiKey"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
              >
                API キー
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
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
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
