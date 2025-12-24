'use client';

import { useState } from 'react';
import { createSequence } from '../../utils/admin-api';
import { SequenceForm } from './SequenceForm';

interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}

export default function SequenceNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: { name: string; description?: string; default_send_time: string; steps: SequenceStep[] }) => {
    setLoading(true);
    setError(null);

    const result = await createSequence(data);

    if (result.success) {
      window.location.href = '/admin/sequences';
    } else {
      setError(result.error || 'シーケンスの作成に失敗しました');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/sequences';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <SequenceForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
