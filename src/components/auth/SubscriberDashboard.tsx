import { useSessionAuth } from './SessionAuthProvider';

export function SubscriberDashboard() {
  const { user, logout } = useSessionAuth();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          マイページ
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          {user?.email}
        </p>
      </div>

      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-8 text-center mb-8">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-[var(--color-text-muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">
          マイページは準備中です
        </h2>
        <p className="text-[var(--color-text-secondary)] text-sm">
          購読状況の確認やアカウント設定など、<br />
          便利な機能を近日公開予定です。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-8">
        <h3 className="font-semibold text-[var(--color-text)] mb-4">
          アカウント情報
        </h3>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">メールアドレス</dt>
            <dd className="text-[var(--color-text)]">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">アカウント種別</dt>
            <dd className="text-[var(--color-text)]">購読者</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-[var(--color-border)] pt-6">
        <button
          onClick={logout}
          className="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-error)]
                   border border-[var(--color-border)] rounded-lg hover:border-[var(--color-error)]
                   transition-colors"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
