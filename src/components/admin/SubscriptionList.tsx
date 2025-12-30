'use client';

import { useState, useEffect } from 'react';
import { listSubscriptions, type SubscriptionWithSubscriber } from '../../utils/admin-api';

const statusLabels: Record<string, string> = {
  active: '有効',
  past_due: '支払い遅延',
  canceled: '解約済',
  unpaid: '未払い',
  lifetime: '永久会員',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-gray-100 text-gray-800',
  unpaid: 'bg-red-100 text-red-800',
  lifetime: 'bg-purple-100 text-purple-800',
};

const planTypeLabels: Record<string, string> = {
  monthly: '月額',
  yearly: '年額',
  lifetime: '買い切り',
};

function formatDate(timestamp: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleDateString('ja-JP');
}

export function SubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchSubscriptions = async () => {
    setLoading(true);
    const result = await listSubscriptions(statusFilter ? { status: statusFilter } : undefined);
    if (result.success && result.data) {
      setSubscriptions(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load subscriptions');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [statusFilter]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-white rounded-lg h-12" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg h-16" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSubscriptions}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-[var(--color-text-secondary)]">ステータス:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg bg-white text-[var(--color-text)]"
        >
          <option value="">すべて</option>
          <option value="active">有効</option>
          <option value="past_due">支払い遅延</option>
          <option value="canceled">解約済</option>
          <option value="lifetime">永久会員</option>
        </select>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[var(--color-text-secondary)]">該当するサブスクリプションがありません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[var(--color-border)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)]">
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">購読者</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">プラン</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">タイプ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">ステータス</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">現在の期間</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">開始日</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]"></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr
                  key={subscription.id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-[var(--color-text)] font-medium">{subscription.subscriber_email}</p>
                      {subscription.subscriber_name && (
                        <p className="text-sm text-[var(--color-text-secondary)]">{subscription.subscriber_name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{subscription.plan_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {planTypeLabels[subscription.plan_type] || subscription.plan_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[subscription.status] || 'bg-gray-100 text-gray-800'}`}>
                      {statusLabels[subscription.status] || subscription.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {subscription.current_period_start && subscription.current_period_end ? (
                      <>
                        {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {formatDate(subscription.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/payments/billing/${subscription.subscriber_id}`}
                      className="text-[var(--color-accent)] hover:underline text-sm"
                    >
                      詳細
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
