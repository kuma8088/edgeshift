'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { SequenceStepEditor } from './SequenceStepEditor';
import { SequenceTimelinePreview } from './SequenceTimelinePreview';

interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number;
  subject: string;
  content: string;
}

interface Sequence {
  id?: string;
  name: string;
  description?: string;
  default_send_time?: string;
  steps: SequenceStep[];
}

type TimingMode = 'days' | 'minutes';

interface SequenceFormProps {
  sequence?: Sequence;
  onSubmit: (data: { name: string; description?: string; default_send_time: string; steps: SequenceStep[] }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function SequenceForm({ sequence, onSubmit, onCancel, loading = false }: SequenceFormProps) {
  const [name, setName] = useState(sequence?.name || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [defaultSendTime, setDefaultSendTime] = useState(sequence?.default_send_time || '10:00');
  const [steps, setSteps] = useState<SequenceStep[]>(
    sequence?.steps || [{ delay_days: 0, subject: '', content: '' }]
  );
  // Timing mode for step 1: 'days' for day+time, 'minutes' for immediate/delay
  const [step1TimingMode, setStep1TimingMode] = useState<TimingMode>(
    sequence?.steps?.[0]?.delay_minutes !== undefined ? 'minutes' : 'days'
  );
  const [error, setError] = useState('');

  // Update state when sequence prop changes (e.g., after API fetch)
  useEffect(() => {
    if (sequence) {
      setName(sequence.name || '');
      setDescription(sequence.description || '');
      setDefaultSendTime(sequence.default_send_time || '10:00');
      setSteps(sequence.steps || [{ delay_days: 0, subject: '', content: '' }]);
      setStep1TimingMode(
        sequence.steps?.[0]?.delay_minutes !== undefined ? 'minutes' : 'days'
      );
    }
  }, [sequence]);

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
      default_send_time: defaultSendTime,
      steps: steps.map((step, index) => {
        // Step 1: Apply timing mode
        if (index === 0 && step1TimingMode === 'minutes') {
          return {
            delay_days: 0,
            delay_time: undefined,
            delay_minutes: step.delay_minutes ?? 0,
            subject: step.subject.trim(),
            content: step.content.trim(),
          };
        }
        // Other steps or step 1 in days mode
        return {
          delay_days: step.delay_days,
          delay_time: step.delay_time,
          subject: step.subject.trim(),
          content: step.content.trim(),
        };
      }),
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
        <label htmlFor="default_send_time" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          デフォルト送信時刻 <span className="text-red-500">*</span>
        </label>
        <input
          type="time"
          id="default_send_time"
          value={defaultSendTime}
          onChange={(e) => setDefaultSendTime(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          各ステップで個別に指定しない場合、この時刻に送信されます（日本時間）
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
            メールステップ <span className="text-red-500">*</span>
          </label>
          {sequence?.id && (
            <a
              href={`/admin/sequences/steps?id=${sequence.id}`}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              個別に編集 →
            </a>
          )}
        </div>
        <SequenceStepEditor
          steps={steps}
          onChange={setSteps}
          step1TimingMode={step1TimingMode}
          onStep1TimingModeChange={setStep1TimingMode}
        />
      </div>

      {steps.length > 0 && steps[0].subject && (
        <SequenceTimelinePreview
          defaultSendTime={defaultSendTime}
          steps={steps}
        />
      )}

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
