'use client';

import { useState, useEffect } from 'react';
import { updatePlan, type Plan, type CreatePlanData } from '../../utils/admin-api';
import { PlanForm } from './PlanForm';

// Simple API request for fetching a single plan
async function getPlan(id: string): Promise<{ success: boolean; data?: Plan; error?: string }> {
  const apiKey = localStorage.getItem('edgeshift_admin_api_key');
  if (!apiKey) {
    return { success: false, error: 'Not authenticated' };
  }

  const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';

  try {
    const response = await fetch(`${API_BASE}/premium/plans/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

export default function PlanEditFormWrapper() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      setError('Plan ID is required');
      setLoading(false);
      return;
    }

    getPlan(id).then((result) => {
      if (result.success && result.data) {
        setPlan(result.data);
      } else {
        setError(result.error || 'Failed to load plan');
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (data: CreatePlanData & { is_active?: number }) => {
    if (!plan) return;

    setSubmitLoading(true);
    setError(null);

    const result = await updatePlan(plan.id, data);

    if (result.success) {
      window.location.href = '/admin/payments';
    } else {
      setError(result.error || 'Failed to update plan');
      setSubmitLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/payments';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <a
          href="/admin/payments"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          プラン一覧に戻る
        </a>
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
      {plan && (
        <PlanForm
          plan={plan}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={submitLoading}
        />
      )}
    </>
  );
}
