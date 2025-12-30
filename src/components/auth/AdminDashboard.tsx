import { useSessionAuth } from './SessionAuthProvider';

export function AdminDashboard() {
  const { user, logout } = useSessionAuth();

  const menuItems = [
    {
      title: 'ダッシュボード',
      href: '/admin',
      description: 'ニュースレターの統計情報',
    },
    {
      title: 'ニュースレター管理',
      href: '/admin/campaigns',
      description: 'キャンペーンの作成・編集',
    },
    {
      title: '購読者管理',
      href: '/admin/subscribers',
      description: '購読者リストの管理',
    },
    {
      title: '決済管理',
      href: '/admin/payments',
      description: 'プラン・商品・サブスクリプション',
    },
    {
      title: 'シーケンス',
      href: '/admin/sequences',
      description: '自動メールシーケンス',
    },
    {
      title: '分析',
      href: '/admin/analytics',
      description: '詳細な分析データ',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          管理ダッシュボード
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          ようこそ、{user?.email}
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          ロール: {user?.role === 'owner' ? 'オーナー' : user?.role === 'admin' ? '管理者' : '購読者'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {menuItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block p-6 bg-white rounded-xl border border-[var(--color-border)]
                     hover:border-[var(--color-accent)] hover:shadow-md transition-all group"
          >
            <h3 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {item.description}
            </p>
          </a>
        ))}
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
