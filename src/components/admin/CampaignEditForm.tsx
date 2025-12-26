'use client';

import { useState, useEffect } from 'react';
import { getCampaign, updateCampaign } from '../../utils/admin-api';
import { CampaignForm } from './CampaignForm';

interface Campaign {
  id: string;
  subject: string;
  content: string;
  scheduled_at?: number;
  status: string;
}

interface CampaignEditFormProps {
  campaignId: string;
}

export default function CampaignEditForm({ campaignId }: CampaignEditFormProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCampaign = async () => {
      const result = await getCampaign(campaignId);
      if (result.success && result.data) {
        const data = result.data as { campaign: Campaign };
        setCampaign(data.campaign);
      } else {
        setFetchError(result.error || 'Failed to load campaign');
      }
    };

    fetchCampaign();
  }, [campaignId]);

  const handleSubmit = async (data: { subject: string; content: string; scheduled_at?: number }) => {
    setLoading(true);
    setError(null);

    const result = await updateCampaign(campaignId, data);

    if (result.success) {
      // Redirect to campaigns list
      window.location.href = '/admin/campaigns';
    } else {
      setError(result.error || 'Failed to update campaign');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/campaigns';
  };

  if (fetchError) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{fetchError}</p>
        <a
          href="/admin/campaigns"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          ニュースレター一覧に戻る
        </a>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <div className="text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <CampaignForm
        campaign={campaign}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
