import { useState, type FormEvent } from 'react';
import { registerForCourse } from '../../utils/auth-api';

interface Props {
  signupPageSlug: string;
}

export default function CourseRegistrationForm({ signupPageSlug }: Props) {
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    const result = await registerForCourse(email.trim(), signupPageSlug);

    if (result.success) {
      setSent(true);
    } else {
      setError(result.error || 'エラーが発生しました。再試行してください。');
    }

    setLoading(false);
  };

  if (sent) {
    return (
      <div className="text-center py-8">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-green-500"
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
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          メールを確認してください
        </h3>
        <p className="text-gray-600 mb-4">
          <span className="font-medium">{email}</span> に<br />
          ログインリンクを送信しました。
        </p>
        <p className="text-sm text-gray-500">
          メールのリンクをクリックすると、コースにアクセスできます。<br />
          届かない場合は迷惑メールフォルダをご確認ください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        autoComplete="email"
        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                 text-gray-900 placeholder-gray-400"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg
                 hover:bg-blue-700 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? '登録中...' : '無料で登録する'}
      </button>
      {error && (
        <p className="text-red-500 text-sm mt-1 sm:col-span-2 basis-full">{error}</p>
      )}
    </form>
  );
}
