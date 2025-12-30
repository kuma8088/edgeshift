'use client';

import { useState } from 'react';
import { createPlan, type CreatePlanData } from '../../utils/admin-api';
import { PlanForm } from './PlanForm';

export default function PlanNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CreatePlanData) => {
    setLoading(true);
    setError(null);

    const result = await createPlan(data);

    if (result.success) {
      window.location.href = '/admin/payments';
    } else {
      setError(result.error || 'Failed to create plan');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/payments';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <PlanForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
