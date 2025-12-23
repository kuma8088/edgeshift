'use client';

import { useState, useEffect } from 'react';
import { listSubscribers } from '../../utils/admin-api';

interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: 'active' | 'pending' | 'unsubscribed';
  subscribed_at?: number;
  unsubscribed_at?: number;
  created_at: number;
}

const statusColors = {
  active: 'bg-green-500 text-white',
  pending: 'bg-yellow-500 text-white',
  unsubscribed: 'bg-[#a3a3a3] text-white',
};

const statusLabels = {
  active: 'アクティブ',
  pending: '確認待ち',
  unsubscribed: '登録解除',
};

export function SubscriberList() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchSubscribers = async (status?: string) => {
    setLoading(true);
    const params = status && status !== 'all' ? { status } : undefined;
    const result = await listSubscribers(params);
    if (result.success && result.data) {
      setSubscribers(result.data as Subscriber[]);
      setError(null);
    } else {
      setError(result.error || 'Failed to load subscribers');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSubscribers(filterStatus);
  }, [filterStatus]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 h-20" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => fetchSubscribers(filterStatus)}
          className="px-6 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Filter dropdown */}
      <div className="mb-6">
        <label htmlFor="status-filter" className="block text-sm font-medium text-[#525252] mb-2">
          ステータスで絞り込み
        </label>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={handleFilterChange}
          className="px-4 py-2 border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent"
        >
          <option value="all">すべて</option>
          <option value="active">アクティブ</option>
          <option value="pending">確認待ち</option>
          <option value="unsubscribed">登録解除</option>
        </select>
      </div>

      {/* Subscribers table */}
      {subscribers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#525252]">
            {filterStatus === 'all'
              ? '購読者がまだいません'
              : `${statusLabels[filterStatus as keyof typeof statusLabels]}の購読者がいません`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-[#e5e5e5] overflow-hidden">
          <table className="min-w-full divide-y divide-[#e5e5e5]">
            <thead className="bg-[#f5f5f5]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#525252] uppercase tracking-wider">
                  メールアドレス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#525252] uppercase tracking-wider">
                  名前
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#525252] uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#525252] uppercase tracking-wider">
                  登録日時
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#e5e5e5]">
              {subscribers.map((subscriber) => (
                <tr key={subscriber.id} className="hover:bg-[#f9f9f9] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[#1e1e1e]">{subscriber.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[#525252]">
                      {subscriber.name || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        statusColors[subscriber.status]
                      }`}
                    >
                      {statusLabels[subscriber.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[#525252]">
                      {subscriber.status === 'unsubscribed' && subscriber.unsubscribed_at ? (
                        <div>
                          <div className="text-xs text-[#a3a3a3]">登録解除:</div>
                          <div>{new Date(subscriber.unsubscribed_at * 1000).toLocaleString('ja-JP')}</div>
                        </div>
                      ) : subscriber.subscribed_at ? (
                        <div>{new Date(subscriber.subscribed_at * 1000).toLocaleString('ja-JP')}</div>
                      ) : (
                        <div>{new Date(subscriber.created_at * 1000).toLocaleString('ja-JP')}</div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
