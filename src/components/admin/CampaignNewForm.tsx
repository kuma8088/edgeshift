'use client';

import { useState } from 'react';
import { createCampaign } from '../../utils/admin-api';
import { CampaignForm } from './CampaignForm';

export default function CampaignNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: { subject: string; content: string; scheduled_at?: number }) => {
    setLoading(true);
    setError(null);

    const result = await createCampaign(data);

    if (result.success) {
      // Redirect to campaigns list
      window.location.href = '/admin/campaigns';
    } else {
      setError(result.error || 'Failed to create campaign');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/campaigns';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <CampaignForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
