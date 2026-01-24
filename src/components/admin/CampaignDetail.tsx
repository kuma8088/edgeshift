'use client';

import { useState, useEffect } from 'react';
import { getCampaign, getCampaignTracking, getCampaignClicks } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface Campaign {
  id: string;
  subject: string;
  content: string;
  status: string;
  sent_at?: number;
  created_at: number;
  ab_test_enabled?: number | boolean;
  ab_subject_b?: string | null;
  ab_from_name_b?: string | null;
  ab_stats?: AbTestStats;
}

interface AbVariantStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
  score: number;
}

interface AbTestStats {
  variant_a: AbVariantStats;
  variant_b: AbVariantStats;
  winner: 'A' | 'B' | null;
  status: 'pending' | 'testing' | 'determined';
}

interface TrackingStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
  reached: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
}

interface Click {
  email: string;
  url: string;
  original_url?: string;  // Resolved from short_urls
  position?: number;      // Link position in email
  clicked_at: number;
}

interface UnsubscribedUser {
  email: string;
  name: string | null;
  unsubscribed_at: number;
}

interface ClicksSummary {
  total_clicks: number;
  unique_clicks: number;
  top_urls: Array<{ url: string; original_url?: string; clicks: number }>;
}

interface CampaignDetailProps {
  campaignId: string;
}

function AbTestResults({ stats, campaign }: { stats: AbTestStats; campaign: Campaign }) {
  const getStatusBadge = () => {
    switch (stats.status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">待機中</span>;
      case 'testing':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">テスト中</span>;
      case 'determined':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">完了</span>;
    }
  };

  const VariantCard = ({ variant, label, subject, isWinner }: {
    variant: AbVariantStats;
    label: string;
    subject: string;
    isWinner: boolean;
  }) => (
    <div className={`p-4 rounded-lg ${isWinner ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50 border border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-gray-900">パターン{label}</span>
        {isWinner && <span className="text-lg">&#x1F3C6;</span>}
      </div>
      <p className="text-sm text-gray-600 mb-3 truncate" title={subject}>
        件名: {subject}
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">送信数</span>
          <span className="font-medium">{variant.sent}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">開封率</span>
          <span className="font-medium">{(variant.open_rate * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">クリック率</span>
          <span className="font-medium">{(variant.click_rate * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-gray-200">
          <span className="text-gray-700 font-medium">スコア</span>
          <span className="font-bold text-blue-600">{variant.score.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">A/Bテスト結果</h3>
        {getStatusBadge()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VariantCard
          variant={stats.variant_a}
          label="A"
          subject={campaign.subject}
          isWinner={stats.winner === 'A'}
        />
        <VariantCard
          variant={stats.variant_b}
          label="B"
          subject={campaign.ab_subject_b || ''}
          isWinner={stats.winner === 'B'}
        />
      </div>

      {stats.status === 'testing' && (
        <p className="mt-4 text-sm text-gray-500 text-center">
          &#x23F3; テスト中... 本配信時に勝者が決定されます
        </p>
      )}
    </div>
  );
}

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [clicksSummary, setClicksSummary] = useState<ClicksSummary | null>(null);
  const [unsubscribedUsers, setUnsubscribedUsers] = useState<UnsubscribedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [campaignResult, trackingResult, clicksResult] = await Promise.all([
          getCampaign(campaignId),
          getCampaignTracking(campaignId),
          getCampaignClicks(campaignId),
        ]);

        if (!campaignResult.success) {
          setError(campaignResult.error || 'Failed to load campaign');
          setLoading(false);
          return;
        }

        const campaignData = campaignResult.data as { campaign: Campaign };
        setCampaign(campaignData.campaign);

        if (trackingResult.success && trackingResult.data) {
          const trackingData = trackingResult.data as { stats: TrackingStats };
          setStats(trackingData.stats);
        }

        if (clicksResult.success && clicksResult.data) {
          const clicksData = clicksResult.data as {
            clicks: Click[];
            summary: ClicksSummary;
            unsubscribed_users: UnsubscribedUser[];
          };
          setClicks(clicksData.clicks || []);
          setClicksSummary(clicksData.summary);
          setUnsubscribedUsers(clicksData.unsubscribed_users || []);
        }

        setError(null);
      } catch (err) {
        setError('Unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-white rounded-lg p-6 h-24" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-6 h-32" />
          ))}
        </div>
        <div className="bg-white rounded-lg p-6 h-64" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'ニュースレターが見つかりません'}</p>
        <a
          href="/admin/campaigns"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          ニュースレター一覧に戻る
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              {campaign.subject}
            </h1>
            {campaign.sent_at && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                送信日時: {new Date(campaign.sent_at * 1000).toLocaleString('ja-JP')}
              </p>
            )}
          </div>
          <a
            href="/admin/campaigns"
            className="px-4 py-2 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            ← 一覧に戻る
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <section>
          <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
            配信統計
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">総送信数</p>
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {stats.total_sent.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">配信完了</p>
              <p className="text-3xl font-bold text-[var(--color-text)] mb-2">
                {stats.delivered.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">開封</p>
              <div className="mb-2">
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {stats.opened.toLocaleString()}
                </p>
              </div>
              <ProgressBar
                value={stats.opened}
                max={stats.reached}
                showPercentage={true}
                size="sm"
                color="blue"
              />
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">解除</p>
              <div className="mb-2">
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {stats.unsubscribed.toLocaleString()}
                </p>
              </div>
              <ProgressBar
                value={stats.unsubscribed}
                max={stats.total_sent}
                showPercentage={true}
                size="sm"
                color="red"
              />
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">バウンス</p>
              <div className="mb-2">
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {stats.bounced.toLocaleString()}
                </p>
              </div>
              <ProgressBar
                value={stats.bounced}
                max={stats.total_sent}
                showPercentage={true}
                size="sm"
                color="yellow"
              />
            </div>
          </div>
        </section>
      )}

      {/* A/B Test Results */}
      {!!campaign.ab_test_enabled && campaign.ab_stats && (
        <AbTestResults stats={campaign.ab_stats} campaign={campaign} />
      )}

      {/* Click Details */}
      {clicksSummary && (
        <section>
          <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
            クリック詳細
          </h2>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">総クリック数</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {clicksSummary.total_clicks.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                ユニーククリック数
              </p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {clicksSummary.unique_clicks.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                平均クリック/購読者
              </p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {clicksSummary.unique_clicks > 0
                  ? (clicksSummary.total_clicks / clicksSummary.unique_clicks).toFixed(1)
                  : '0'}
              </p>
            </div>
          </div>

          {/* Top URLs */}
          {clicksSummary.top_urls && clicksSummary.top_urls.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] mb-6">
              <h3 className="text-base font-medium text-[var(--color-text)] mb-4">
                人気のURL
              </h3>
              <div className="space-y-3">
                {clicksSummary.top_urls.map((item, index) => {
                  const displayUrl = item.original_url || item.url;
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <a
                          href={displayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--color-accent)] hover:underline truncate block"
                          title={displayUrl}
                        >
                          {displayUrl}
                        </a>
                      </div>
                      <span className="ml-4 text-sm font-medium text-[var(--color-text)]">
                        {item.clicks} クリック
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unsubscribed Users */}
          {unsubscribedUsers.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] mb-6">
              <h3 className="text-base font-medium text-[var(--color-text)] mb-4">
                配信解除したユーザー ({unsubscribedUsers.length}人)
              </h3>
              <div className="space-y-3">
                {unsubscribedUsers.map((user, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text)]">
                        {user.email}
                      </div>
                      {user.name && (
                        <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {user.name}
                        </div>
                      )}
                    </div>
                    <span className="ml-4 text-xs text-[var(--color-text-secondary)]">
                      {new Date(user.unsubscribed_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Clicks Table */}
          {clicks.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-base font-medium text-[var(--color-text)]">
                  最近のクリック
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--color-bg-tertiary)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        購読者
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        クリック日時
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {clicks.map((click, index) => {
                      const displayUrl = click.original_url || click.url;
                      return (
                        <tr key={index} className="hover:bg-[var(--color-bg-tertiary)]">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                            {click.email}
                          </td>
                          <td className="px-6 py-4 text-sm text-[var(--color-accent)] max-w-md truncate">
                            <a
                              href={displayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              title={displayUrl}
                            >
                              {displayUrl}
                            </a>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                            {new Date(click.clicked_at * 1000).toLocaleString('ja-JP')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {clicks.length === 0 && (
            <div className="bg-white rounded-lg p-12 shadow-sm border border-[var(--color-border)] text-center">
              <p className="text-[var(--color-text-secondary)]">
                まだクリックがありません
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
