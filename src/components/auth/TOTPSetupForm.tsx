import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { setupTOTP } from '../../utils/auth-api';

interface Props {
  token: string;
  email: string;
  qrCodeUrl: string;
  secret: string;
  onSuccess?: () => void;
}

export function TOTPSetupForm({ token, email, qrCodeUrl, secret, onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

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

    const result = await setupTOTP(token, cleanCode);

    if (result.success && result.data) {
      setSuccess(true);
      onSuccess?.();
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

  // Show success message after successful setup
  if (success) {
    return (
      <div>
        <div className="text-center mb-6">
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
            2段階認証を設定しました
          </h2>
          <p className="text-[var(--color-text-secondary)]">
            次回ログイン時から認証アプリのコードが必要になります。
          </p>
        </div>

        <a
          href="/auth/dashboard"
          className="block w-full py-3 bg-[var(--color-accent)] text-white font-medium rounded-lg
                   hover:bg-[var(--color-accent-hover)] transition-colors text-center"
        >
          ダッシュボードへ
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          2段階認証の設定
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
          {email}
        </p>
      </div>

      <div className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Google Authenticator や Authy などの認証アプリで<br />
          以下のQRコードをスキャンしてください。
        </p>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="bg-white p-4 rounded-lg border border-[var(--color-border)]">
            <QRCodeSVG
              value={qrCodeUrl}
              size={192}
              level="M"
              marginSize={0}
              title="TOTP QR Code"
              role="img"
            />
          </div>
        </div>

        {/* Manual entry option */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            {showSecret ? 'シークレットキーを隠す' : 'QRコードをスキャンできない場合'}
          </button>
          {showSecret && (
            <div className="mt-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg">
              <p className="text-xs text-[var(--color-text-muted)] mb-1">
                シークレットキー（手動入力）
              </p>
              <code className="text-sm font-mono break-all">{secret}</code>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label
            htmlFor="code"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
          >
            認証コード（6桁）
          </label>
          <input
            type="text"
            id="code"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full px-4 py-3 border border-[var(--color-border)] rounded-lg
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
          {loading ? '確認中...' : '設定を完了'}
        </button>
      </form>
    </div>
  );
}
