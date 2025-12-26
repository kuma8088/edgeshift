'use client';

import { useState, useEffect } from 'react';
import { getSequence, updateSequence, type Sequence } from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';
import { StepSidebar } from './StepSidebar';

interface SequenceStepEditProps {
  sequenceId: string;
  stepNumber: number;
}

interface StepData {
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}

export function SequenceStepEdit({ sequenceId, stepNumber }: SequenceStepEditProps) {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [stepData, setStepData] = useState<StepData>({
    delay_days: 0,
    delay_time: '',
    subject: '',
    content: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    loadSequence();
  }, [sequenceId, stepNumber]);

  const loadSequence = async () => {
    setLoading(true);
    setError(null);

    const result = await getSequence(sequenceId);
    const responseData = result.data as { sequence?: Sequence } | undefined;
    if (result.success && responseData?.sequence) {
      const seq = responseData.sequence;
      setSequence(seq);

      // Load step data (stepNumber is 1-indexed)
      const step = seq.steps[stepNumber - 1];
      if (step) {
        setStepData({
          delay_days: step.delay_days,
          delay_time: step.delay_time || '',
          subject: step.subject,
          content: step.content,
        });
      } else {
        // Redirect to step list if step doesn't exist
        setLoading(false);
        window.location.href = `/admin/sequences/steps?id=${sequenceId}`;
        return;
      }
    } else {
      setError(result.error || 'シーケンスの読み込みに失敗しました');
    }

    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    if (!sequence) return;

    // Guard: ensure step index is valid
    if (stepNumber < 1 || stepNumber > sequence.steps.length) {
      setError('無効なステップ番号です');
      setSaving(false);
      return;
    }

    // Update the specific step
    const updatedSteps = [...sequence.steps];
    updatedSteps[stepNumber - 1] = stepData;

    // Sort steps by delay_days, then by delay_time
    const sortedSteps = [...updatedSteps].sort((a, b) => {
      if (a.delay_days !== b.delay_days) {
        return a.delay_days - b.delay_days;
      }
      // Compare delay_time (empty string comes first, then lexicographic order)
      const timeA = a.delay_time || '00:00';
      const timeB = b.delay_time || '00:00';
      return timeA.localeCompare(timeB);
    });

    const result = await updateSequence(sequenceId, { steps: sortedSteps });

    if (result.success) {
      // Find new position of the step we just edited
      const newPosition = sortedSteps.findIndex(
        (s) =>
          s.subject === stepData.subject &&
          s.content === stepData.content &&
          s.delay_days === stepData.delay_days &&
          s.delay_time === stepData.delay_time
      );
      const newStepNumber = newPosition + 1;

      if (newStepNumber !== stepNumber) {
        // Step moved, navigate to new position
        window.location.href = `/admin/sequences/steps/edit?id=${sequenceId}&step=${newStepNumber}`;
      } else {
        setSuccessMessage('保存しました');
        await loadSequence();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } else {
      setError(result.error || '保存に失敗しました');
    }

    setSaving(false);
  };

  const handleNavigate = (step: number) => {
    window.location.href = `/admin/sequences/steps/edit?id=${sequenceId}&step=${step}`;
  };

  const handleAddStep = async () => {
    if (!sequence) return;

    const newStep: StepData = {
      delay_days: 0,
      delay_time: '',
      subject: '',
      content: '',
    };

    const updatedSteps = [...sequence.steps, newStep];

    // Sort steps by delay_days, then by delay_time
    const sortedSteps = [...updatedSteps].sort((a, b) => {
      if (a.delay_days !== b.delay_days) {
        return a.delay_days - b.delay_days;
      }
      const timeA = a.delay_time || '00:00';
      const timeB = b.delay_time || '00:00';
      return timeA.localeCompare(timeB);
    });

    const result = await updateSequence(sequenceId, { steps: sortedSteps });

    if (result.success) {
      // Find position of the new step (delay_days=0, empty content)
      const newPosition = sortedSteps.findIndex(
        (s) => s.subject === '' && s.content === '' && s.delay_days === 0
      );
      window.location.href = `/admin/sequences/steps/edit?id=${sequenceId}&step=${newPosition + 1}`;
    } else {
      setError(result.error || 'ステップの追加に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!sequence) return;

    if (!confirm('このステップを削除してもよろしいですか？')) {
      return;
    }

    const updatedSteps = sequence.steps.filter((_: StepData, i: number) => i !== stepNumber - 1);
    const result = await updateSequence(sequenceId, { steps: updatedSteps });

    if (result.success) {
      // Redirect to step list or previous step
      if (updatedSteps.length === 0) {
        window.location.href = `/admin/sequences/steps?id=${sequenceId}`;
      } else {
        const newStepNumber = Math.min(stepNumber, updatedSteps.length);
        window.location.href = `/admin/sequences/steps/edit?id=${sequenceId}&step=${newStepNumber}`;
      }
    } else {
      setError(result.error || 'ステップの削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--color-text-muted)]">読み込み中...</div>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'シーケンスが見つかりません'}
      </div>
    );
  }

  const sidebarSteps = sequence.steps.map((step: StepData, index: number) => ({
    step_number: index + 1,
    subject: step.subject,
    delay_days: step.delay_days,
  }));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <StepSidebar
        sequenceId={sequenceId}
        steps={sidebarSteps}
        currentStep={stepNumber}
        onNavigate={handleNavigate}
        onAddStep={handleAddStep}
        isMobileOpen={isMobileSidebarOpen}
        onMobileToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Main content */}
      <div className="flex-1 p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-2">
            <a href="/admin/sequences" className="hover:text-[var(--color-accent)]">
              シーケンス
            </a>
            <span>/</span>
            <a
              href={`/admin/sequences/steps?id=${sequenceId}`}
              className="hover:text-[var(--color-accent)]"
            >
              {sequence.name}
            </a>
            <span>/</span>
            <span>ステップ {stepNumber}</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            ステップ {stepNumber} の編集
          </h1>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Delay Days */}
          <div>
            <label
              htmlFor="delay_days"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              送信までの日数 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="delay_days"
              value={stepData.delay_days}
              onChange={(e) =>
                setStepData({ ...stepData, delay_days: parseInt(e.target.value) || 0 })
              }
              min="0"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
              required
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              購読登録後、何日後に送信するか（0 = 即時送信）
            </p>
          </div>

          {/* Delay Time */}
          <div>
            <label
              htmlFor="delay_time"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              送信時刻（オプション）
            </label>
            <input
              type="time"
              id="delay_time"
              value={stepData.delay_time || ''}
              onChange={(e) =>
                setStepData({ ...stepData, delay_time: e.target.value })
              }
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              空欄の場合、デフォルト時刻を使用
            </p>
          </div>

          {/* Subject */}
          <div>
            <label
              htmlFor="subject"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="subject"
              value={stepData.subject}
              onChange={(e) =>
                setStepData({ ...stepData, subject: e.target.value })
              }
              placeholder="メールの件名を入力"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Content */}
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              本文 <span className="text-red-500">*</span>
            </label>
            <RichTextEditor
              value={stepData.content}
              onChange={(html) => setStepData({ ...stepData, content: html })}
              placeholder="メール本文を入力..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              このステップを削除
            </button>

            <div className="flex gap-3">
              <a
                href={`/admin/sequences/steps?id=${sequenceId}`}
                className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                キャンセル
              </a>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
