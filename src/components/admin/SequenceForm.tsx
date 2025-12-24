'use client';

import { useState, type FormEvent } from 'react';
import { SequenceStepEditor } from './SequenceStepEditor';

interface SequenceStep {
  delay_days: number;
  subject: string;
  content: string;
}

interface Sequence {
  id?: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
}

interface SequenceFormProps {
  sequence?: Sequence;
  onSubmit: (data: { name: string; description?: string; steps: SequenceStep[] }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function SequenceForm({ sequence, onSubmit, onCancel, loading = false }: SequenceFormProps) {
  const [name, setName] = useState(sequence?.name || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [steps, setSteps] = useState<SequenceStep[]>(
    sequence?.steps || [{ delay_days: 0, subject: '', content: '' }]
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('シーケンス名を入力してください');
      return;
    }

    if (steps.length === 0) {
      setError('少なくとも1つのステップを追加してください');
      return;
    }

    // Validate all steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.subject.trim()) {
        setError(`ステップ ${i + 1}: 件名を入力してください`);
        return;
      }
      if (!step.content.trim()) {
        setError(`ステップ ${i + 1}: 本文を入力してください`);
        return;
      }
      if (step.delay_days < 0) {
        setError(`ステップ ${i + 1}: 送信までの日数は0以上で指定してください`);
        return;
      }
    }

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      steps: steps.map(step => ({
        delay_days: step.delay_days,
        subject: step.subject.trim(),
        content: step.content.trim(),
      })),
    };

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          シーケンス名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: ウェルカムシーケンス"
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          説明（オプション）
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="このシーケンスの目的や内容を説明"
          rows={3}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          メールステップ <span className="text-red-500">*</span>
        </label>
        <SequenceStepEditor steps={steps} onChange={setSteps} />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : sequence?.id ? '更新' : '作成'}
        </button>
      </div>
    </form>
  );
}
