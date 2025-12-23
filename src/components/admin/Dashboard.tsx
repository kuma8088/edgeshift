'use client';

import { useState, useEffect } from 'react';
import { getDashboardStats } from '../../utils/admin-api';
import { KPICard } from './KPICard';

interface DashboardStats {
  subscribers: { total: number; active: number; pending: number; unsubscribed: number };
  campaigns: { total: number; draft: number; scheduled: number; sent: number };
  delivery: { total: number; delivered: number; opened: number; clicked: number; openRate: number; clickRate: number };
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    const result = await getDashboardStats();
    if (result.success && result.data) {
      setStats(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load stats');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-6 h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="px-6 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[#1e1e1e]">ダッシュボード</h1>

      {/* Subscriber Stats */}
      <section>
        <h2 className="text-lg font-medium text-[#525252] mb-4">購読者</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総購読者数" value={stats.subscribers.total} />
          <KPICard title="アクティブ" value={stats.subscribers.active} color="success" />
          <KPICard title="確認待ち" value={stats.subscribers.pending} color="warning" />
          <KPICard title="解除済み" value={stats.subscribers.unsubscribed} color="danger" />
        </div>
      </section>

      {/* Campaign Stats */}
      <section>
        <h2 className="text-lg font-medium text-[#525252] mb-4">キャンペーン</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総キャンペーン" value={stats.campaigns.total} />
          <KPICard title="下書き" value={stats.campaigns.draft} />
          <KPICard title="予約済み" value={stats.campaigns.scheduled} color="warning" />
          <KPICard title="送信済み" value={stats.campaigns.sent} color="success" />
        </div>
      </section>

      {/* Delivery Stats */}
      <section>
        <h2 className="text-lg font-medium text-[#525252] mb-4">配信パフォーマンス</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="総配信数" value={stats.delivery.total} />
          <KPICard title="配信完了" value={stats.delivery.delivered} color="success" />
          <KPICard
            title="開封率"
            value={`${stats.delivery.openRate}%`}
            subtitle={`${stats.delivery.opened} 開封`}
          />
          <KPICard
            title="クリック率"
            value={`${stats.delivery.clickRate}%`}
            subtitle={`${stats.delivery.clicked} クリック`}
          />
        </div>
      </section>
    </div>
  );
}
