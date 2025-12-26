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
}

interface TrackingStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  reached: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

interface Click {
  email: string;
  url: string;
  clicked_at: number;
}

interface ClicksSummary {
  total_clicks: number;
  unique_clicks: number;
  top_urls: Array<{ url: string; clicks: number }>;
}

interface CampaignDetailProps {
  campaignId: string;
}

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [clicksSummary, setClicksSummary] = useState<ClicksSummary | null>(null);
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
          };
          setClicks(clicksData.clicks || []);
          setClicksSummary(clicksData.summary);
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">クリック</p>
              <div className="mb-2">
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {stats.clicked.toLocaleString()}
                </p>
              </div>
              <ProgressBar
                value={stats.clicked}
                max={stats.reached}
                showPercentage={true}
                size="sm"
                color="green"
              />
            </div>
          </div>
        </section>
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
                {clicksSummary.top_urls.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-accent)] hover:underline truncate block"
                      >
                        {item.url}
                      </a>
                    </div>
                    <span className="ml-4 text-sm font-medium text-[var(--color-text)]">
                      {item.clicks} クリック
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
                    {clicks.map((click, index) => (
                      <tr key={index} className="hover:bg-[var(--color-bg-tertiary)]">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                          {click.email}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--color-accent)] max-w-md truncate">
                          <a
                            href={click.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {click.url}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                          {new Date(click.clicked_at * 1000).toLocaleString('ja-JP')}
                        </td>
                      </tr>
                    ))}
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
