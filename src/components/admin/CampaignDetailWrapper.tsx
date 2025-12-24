'use client';

import { useEffect, useState } from 'react';
import { CampaignDetail } from './CampaignDetail';

export function CampaignDetailWrapper() {
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
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
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  return <CampaignDetail campaignId={campaignId} />;
}
