'use client';

import { useEffect, useState } from 'react';
import CampaignEditForm from './CampaignEditForm';

export default function CampaignEditFormWrapper() {
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    // Get campaign ID from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      window.location.href = '/admin/campaigns';
      return;
    }

    setCampaignId(id);
  }, []);

  if (!campaignId) {
    return (
      <div className="text-center py-12">
        <div className="text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  return <CampaignEditForm campaignId={campaignId} />;
}
