'use client';

import { useState, useEffect } from 'react';
import { getSequence, updateSequence } from '../../utils/admin-api';
import { SequenceForm } from './SequenceForm';

interface SequenceStep {
  id?: string;
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
  template_id?: string;
}

interface Sequence {
  id: string;
  name: string;
  description?: string;
  default_send_time?: string;
  steps: SequenceStep[];
}

export default function SequenceEditForm() {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sequenceId = urlParams.get('id');

    if (!sequenceId) {
      setError('シーケンスIDが指定されていません');
      setLoading(false);
      return;
    }

    getSequence(sequenceId).then((result) => {
      if (result.success && result.data) {
        const data = result.data as { sequence: Sequence };
        setSequence(data.sequence);
      } else {
        setError(result.error || 'シーケンスの読み込みに失敗しました');
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (data: { name: string; description?: string; default_send_time: string; steps: SequenceStep[] }) => {
    if (!sequence) return;

    setSaving(true);
    setError(null);

    const updateData = {
      name: data.name,
      description: data.description,
      default_send_time: data.default_send_time,
      steps: data.steps,
    };

    const result = await updateSequence(sequence.id, updateData);

    if (result.success) {
      window.location.href = '/admin/sequences';
    } else {
      setError(result.error || 'シーケンスの更新に失敗しました');
      setSaving(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/sequences';
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-pulse text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  if (error && !sequence) {
    return (
      <div className="text-center py-8 text-red-600">
        {error}
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
      {sequence && (
        <SequenceForm
          sequence={sequence}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={saving}
        />
      )}
    </>
  );
}
