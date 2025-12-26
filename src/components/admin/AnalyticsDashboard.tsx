'use client';

import { useState, useEffect } from 'react';
import { getAnalyticsOverview } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface CampaignPerformance {
  id: string;
  subject: string;
  recipient_count: number;
  open_rate: number;
  click_rate: number;
  sent_at: number;
}

interface SequencePerformance {
  id: string;
  name: string;
  enrolled: number;
  completion_rate: number;
}

interface TopSubscriber {
  email: string;
  open_count: number;
  click_count: number;
}

interface AnalyticsData {
  campaigns: CampaignPerformance[];
  sequences: SequencePerformance[];
  top_subscribers: TopSubscriber[];
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getAnalyticsOverview();

        if (!result.success) {
          setError(result.error || 'Failed to load analytics data');
          setLoading(false);
          return;
        }

        const analyticsData = result.data as { analytics: AnalyticsData };
        setData(analyticsData.analytics);
        setError(null);
      } catch (err) {
        setError('Unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-white rounded-lg p-6 h-24" />
        <div className="bg-white rounded-lg p-6 h-64" />
        <div className="bg-white rounded-lg p-6 h-64" />
        <div className="bg-white rounded-lg p-6 h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || '分析データが見つかりません'}</p>
        <a
          href="/admin"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          ダッシュボードに戻る
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">分析ダッシュボード</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          ニュースレター、シーケンス、購読者のパフォーマンス概要
        </p>
      </div>

      {/* Campaign Performance */}
      <section>
        <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
          ニュースレターパフォーマンス（直近10件）
        </h2>
        {data.campaigns.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--color-bg-tertiary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      件名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      送信数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      開封率
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      クリック率
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      送信日
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="px-6 py-4 text-sm text-[var(--color-text)]">
                        <a
                          href={`/admin/campaigns/detail?id=${campaign.id}`}
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          {campaign.subject}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {campaign.recipient_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <ProgressBar
                            value={campaign.open_rate}
                            max={100}
                            showPercentage={true}
                            size="sm"
                            color="blue"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <ProgressBar
                            value={campaign.click_rate}
                            max={100}
                            showPercentage={true}
                            size="sm"
                            color="green"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                        {new Date(campaign.sent_at * 1000).toLocaleDateString('ja-JP')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-12 shadow-sm border border-[var(--color-border)] text-center">
            <p className="text-[var(--color-text-secondary)]">
              まだ送信されたニュースレターがありません
            </p>
          </div>
        )}
      </section>

      {/* Sequence Performance */}
      <section>
        <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
          シーケンスパフォーマンス
        </h2>
        {data.sequences.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--color-bg-tertiary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      シーケンス名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      登録者数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      完了率
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.sequences.map((sequence) => (
                    <tr key={sequence.id} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="px-6 py-4 text-sm text-[var(--color-text)]">
                        <a
                          href={`/admin/sequences/detail?id=${sequence.id}`}
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          {sequence.name}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {sequence.enrolled.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-40">
                          <ProgressBar
                            value={sequence.completion_rate}
                            max={100}
                            showPercentage={true}
                            size="sm"
                            color="purple"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-12 shadow-sm border border-[var(--color-border)] text-center">
            <p className="text-[var(--color-text-secondary)]">
              まだアクティブなシーケンスがありません
            </p>
          </div>
        )}
      </section>

      {/* Top Engaged Subscribers */}
      <section>
        <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
          エンゲージメントの高い購読者（上位10名）
        </h2>
        {data.top_subscribers.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--color-bg-tertiary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      メールアドレス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      開封回数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      クリック回数
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.top_subscribers.map((subscriber, index) => (
                    <tr key={index} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="px-6 py-4 text-sm text-[var(--color-text)]">
                        {subscriber.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {subscriber.open_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {subscriber.click_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-12 shadow-sm border border-[var(--color-border)] text-center">
            <p className="text-[var(--color-text-secondary)]">
              まだエンゲージメントデータがありません
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
