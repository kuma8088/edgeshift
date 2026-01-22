'use client';

import { useState, useEffect } from 'react';
import { listCampaigns, deleteCampaign, sendCampaign, copyCampaign } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickRate: number;
}

interface Campaign {
  id: string;
  subject: string;
  content: string;
  status: string;
  scheduled_at?: number;
  sent_at?: number;
  created_at: number;
  stats?: CampaignStats;
}

const statusColors = {
  draft: 'bg-[var(--color-text-muted)] text-white',
  scheduled: 'bg-yellow-500 text-white',
  sent: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
};

const statusLabels = {
  draft: '下書き',
  scheduled: '予約済み',
  sent: '送信済み',
  failed: '失敗',
};

export function CampaignList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'send' | 'copy';
    campaignId: string;
    campaignSubject: string;
  }>({
    isOpen: false,
    type: 'delete',
    campaignId: '',
    campaignSubject: '',
  });
  const [copyLoading, setCopyLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    const result = await listCampaigns();
    if (result.success && result.data) {
      const data = result.data as { campaigns: Campaign[]; total: number };
      setCampaigns(data.campaigns || []);
      setError(null);
    } else {
      setError(result.error || 'Failed to load campaigns');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleDelete = (campaign: Campaign) => {
    setConfirmModal({
      isOpen: true,
      type: 'delete',
      campaignId: campaign.id,
      campaignSubject: campaign.subject,
    });
  };

  const handleSend = (campaign: Campaign) => {
    setConfirmModal({
      isOpen: true,
      type: 'send',
      campaignId: campaign.id,
      campaignSubject: campaign.subject,
    });
  };

  const handleCopy = async (campaign: Campaign) => {
    setCopyLoading(campaign.id);
    try {
      const result = await copyCampaign(campaign.id);
      if (result.success) {
        await fetchCampaigns(); // Refresh list
      } else {
        setError(result.error || 'Failed to copy campaign');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setCopyLoading(null);
    }
  };

  const confirmAction = async () => {
    setActionLoading(true);
    const { type, campaignId } = confirmModal;

    try {
      let result;
      if (type === 'delete') {
        result = await deleteCampaign(campaignId);
      } else {
        result = await sendCampaign(campaignId);
      }

      if (result.success) {
        setConfirmModal({ isOpen: false, type: 'delete', campaignId: '', campaignSubject: '' });
        await fetchCampaigns(); // Refresh list
      } else {
        setError(result.error || 'Action failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelAction = () => {
    setConfirmModal({ isOpen: false, type: 'delete', campaignId: '', campaignSubject: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchCampaigns}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)] mb-4">ニュースレターがまだありません</p>
        <a
          href="/admin/campaigns/new"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          新規作成
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-[var(--color-text)]">
                    {campaign.subject}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      statusColors[campaign.status as keyof typeof statusColors]
                    }`}
                  >
                    {statusLabels[campaign.status as keyof typeof statusLabels]}
                  </span>
                  {campaign.status === 'sent' && (
                    <a
                      href={`/admin/campaigns/detail?id=${campaign.id}`}
                      className="text-sm text-[var(--color-accent)] hover:underline"
                    >
                      詳細
                    </a>
                  )}
                </div>
                {campaign.status === 'sent' && campaign.stats && (
                  <div className="flex gap-4 text-sm mb-2">
                    <span className="text-[var(--color-text-secondary)]">
                      開封: <span className="font-medium text-[var(--color-text)]">{campaign.stats.opened}</span>
                      <span className="text-[var(--color-text-muted)]"> ({campaign.stats.openRate}%)</span>
                    </span>
                    <span className="text-[var(--color-text-secondary)]">
                      クリック: <span className="font-medium text-[var(--color-text)]">{campaign.stats.clicked}</span>
                      <span className="text-[var(--color-text-muted)]"> ({campaign.stats.clickRate}%)</span>
                    </span>
                    {campaign.stats.bounced > 0 && (
                      <span className="text-red-500">
                        バウンス: {campaign.stats.bounced}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
                  <span>作成: {new Date(campaign.created_at * 1000).toLocaleString('ja-JP')}</span>
                  {campaign.scheduled_at && (
                    <span>予約: {new Date(campaign.scheduled_at * 1000).toLocaleString('ja-JP')}</span>
                  )}
                  {campaign.sent_at && (
                    <span>送信: {new Date(campaign.sent_at * 1000).toLocaleString('ja-JP')}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <a
                  href={`/admin/campaigns/edit?id=${campaign.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  編集
                </a>
                <button
                  onClick={() => handleCopy(campaign)}
                  disabled={copyLoading === campaign.id}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                  title="コピーを作成"
                >
                  {copyLoading === campaign.id ? '...' : '📋'}
                </button>
                {campaign.status === 'draft' && (
                  <button
                    onClick={() => handleSend(campaign)}
                    className="px-3 py-1 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
                  >
                    送信
                  </button>
                )}
                {campaign.status !== 'sent' && (
                  <button
                    onClick={() => handleDelete(campaign)}
                    className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'delete' ? 'ニュースレターを削除' : 'ニュースレターを送信'}
        message={
          confirmModal.type === 'delete'
            ? `「${confirmModal.campaignSubject}」を削除してもよろしいですか？この操作は取り消せません。`
            : `「${confirmModal.campaignSubject}」を全購読者に送信してもよろしいですか？`
        }
        confirmText={confirmModal.type === 'delete' ? '削除' : '送信'}
        cancelText="キャンセル"
        onConfirm={confirmAction}
        onCancel={cancelAction}
        loading={actionLoading}
      />
    </>
  );
}
