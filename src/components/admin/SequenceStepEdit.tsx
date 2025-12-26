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
  delay_minutes?: number | null;
  subject: string;
  content: string;
}

type TimingMode = 'days' | 'minutes';

export function SequenceStepEdit({ sequenceId, stepNumber }: SequenceStepEditProps) {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [stepData, setStepData] = useState<StepData>({
    delay_days: 0,
    delay_time: '',
    delay_minutes: null,
    subject: '',
    content: '',
  });
  const [timingMode, setTimingMode] = useState<TimingMode>('days');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    loadSequence();
  }, [sequenceId, stepNumber]);

  // Initialize delay_minutes when switching to minutes mode
  useEffect(() => {
    if (timingMode === 'minutes' && stepData.delay_minutes === null) {
      setStepData((prev) => ({ ...prev, delay_minutes: 0 }));
    }
  }, [timingMode]);

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
          delay_minutes: step.delay_minutes ?? null,
          subject: step.subject,
          content: step.content,
        });
        // Set timing mode based on whether delay_minutes is set (step 1 only)
        if (stepNumber === 1 && step.delay_minutes !== null && step.delay_minutes !== undefined) {
          setTimingMode('minutes');
        } else {
          setTimingMode('days');
        }
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

    // Prepare step data based on timing mode
    const preparedStepData: StepData = { ...stepData };
    if (stepNumber === 1) {
      if (timingMode === 'minutes') {
        // Clear delay_days/delay_time when using minutes mode
        preparedStepData.delay_days = 0;
        preparedStepData.delay_time = '';
      } else {
        // Clear delay_minutes when using days mode
        preparedStepData.delay_minutes = null;
      }
    } else {
      // Step 2+ always use days mode
      preparedStepData.delay_minutes = null;
    }

    // Update the specific step
    const updatedSteps = [...sequence.steps];
    updatedSteps[stepNumber - 1] = preparedStepData;

    // Create indexed steps for tracking position after sort
    const indexedSteps = updatedSteps.map((step, idx) => ({ step, originalIndex: idx }));
    const defaultTime = sequence.default_send_time || '10:00';

    // Sort steps: delay_minutes (if set) takes priority, then delay_days + delay_time
    indexedSteps.sort((a, b) => {
      const aMinutes = a.step.delay_minutes;
      const bMinutes = b.step.delay_minutes;

      // If both have delay_minutes, compare them
      if (aMinutes !== null && aMinutes !== undefined && bMinutes !== null && bMinutes !== undefined) {
        return aMinutes - bMinutes;
      }
      // delay_minutes comes before delay_days (minutes are for immediate/near-immediate delivery)
      if (aMinutes !== null && aMinutes !== undefined) return -1;
      if (bMinutes !== null && bMinutes !== undefined) return 1;

      // Both use delay_days
      if (a.step.delay_days !== b.step.delay_days) {
        return a.step.delay_days - b.step.delay_days;
      }
      const timeA = a.step.delay_time || defaultTime;
      const timeB = b.step.delay_time || defaultTime;
      return timeA.localeCompare(timeB);
    });

    const sortedSteps = indexedSteps.map((item) => item.step);
    const result = await updateSequence(sequenceId, { steps: sortedSteps });

    if (result.success) {
      // Find new position by tracking original index
      const newPosition = indexedSteps.findIndex(
        (item) => item.originalIndex === stepNumber - 1
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

    // Create indexed steps for tracking position after sort
    const indexedSteps = updatedSteps.map((step, idx) => ({ step, originalIndex: idx }));
    const defaultTime = sequence.default_send_time || '10:00';

    // Sort steps: delay_minutes (if set) takes priority, then delay_days + delay_time
    indexedSteps.sort((a, b) => {
      const aMinutes = a.step.delay_minutes;
      const bMinutes = b.step.delay_minutes;

      // If both have delay_minutes, compare them
      if (aMinutes !== null && aMinutes !== undefined && bMinutes !== null && bMinutes !== undefined) {
        return aMinutes - bMinutes;
      }
      // delay_minutes comes before delay_days (minutes are for immediate/near-immediate delivery)
      if (aMinutes !== null && aMinutes !== undefined) return -1;
      if (bMinutes !== null && bMinutes !== undefined) return 1;

      // Both use delay_days
      if (a.step.delay_days !== b.step.delay_days) {
        return a.step.delay_days - b.step.delay_days;
      }
      const timeA = a.step.delay_time || defaultTime;
      const timeB = b.step.delay_time || defaultTime;
      return timeA.localeCompare(timeB);
    });

    const sortedSteps = indexedSteps.map((item) => item.step);
    const result = await updateSequence(sequenceId, { steps: sortedSteps });

    if (result.success) {
      // Find new position by tracking original index (new step is last in updatedSteps)
      const newStepOriginalIndex = updatedSteps.length - 1;
      const newPosition = indexedSteps.findIndex(
        (item) => item.originalIndex === newStepOriginalIndex
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
          {/* Timing Section */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
              配信タイミング <span className="text-red-500">*</span>
            </label>

            {/* Step 1: Show timing mode selector */}
            {stepNumber === 1 ? (
              <div className="space-y-4">
                {/* Days mode */}
                <div
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    timingMode === 'days'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  }`}
                  onClick={() => setTimingMode('days')}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="timing_mode"
                      value="days"
                      checked={timingMode === 'days'}
                      onChange={() => setTimingMode('days')}
                      className="w-4 h-4 text-[var(--color-accent)]"
                    />
                    <span className="text-sm font-medium text-[var(--color-text)]">日時指定</span>
                  </label>
                  {timingMode === 'days' && (
                    <div className="mt-4 ml-7 flex gap-4">
                      <div className="flex-1">
                        <label
                          htmlFor="delay_days"
                          className="block text-xs text-[var(--color-text-muted)] mb-1"
                        >
                          日数
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--color-text-muted)]">+</span>
                          <input
                            type="number"
                            id="delay_days"
                            value={stepData.delay_days}
                            onChange={(e) =>
                              setStepData({ ...stepData, delay_days: parseInt(e.target.value) || 0 })
                            }
                            min="0"
                            className="w-20 px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all text-center"
                          />
                          <span className="text-sm text-[var(--color-text-muted)]">日</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label
                          htmlFor="delay_time"
                          className="block text-xs text-[var(--color-text-muted)] mb-1"
                        >
                          時刻
                        </label>
                        <input
                          type="time"
                          id="delay_time"
                          value={stepData.delay_time || ''}
                          onChange={(e) =>
                            setStepData({ ...stepData, delay_time: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                          placeholder={sequence?.default_send_time || '10:00'}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Minutes mode */}
                <div
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    timingMode === 'minutes'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  }`}
                  onClick={() => setTimingMode('minutes')}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="timing_mode"
                      value="minutes"
                      checked={timingMode === 'minutes'}
                      onChange={() => setTimingMode('minutes')}
                      className="w-4 h-4 text-[var(--color-accent)]"
                    />
                    <span className="text-sm font-medium text-[var(--color-text)]">分指定（ステップ1専用）</span>
                  </label>
                  {timingMode === 'minutes' && (
                    <div className="mt-4 ml-7">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          id="delay_minutes"
                          value={stepData.delay_minutes ?? 0}
                          onChange={(e) =>
                            setStepData({ ...stepData, delay_minutes: parseInt(e.target.value) || 0 })
                          }
                          min="0"
                          className="w-24 px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all text-center"
                        />
                        <span className="text-sm text-[var(--color-text-muted)]">分後</span>
                        {(stepData.delay_minutes === 0 || stepData.delay_minutes === null) && (
                          <span className="text-xs text-green-600 ml-2">（即時送信）</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        0 = 即時送信、1以上 = 指定分数後に送信
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Step 2+: Days mode only */
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label
                      htmlFor="delay_days"
                      className="block text-xs text-[var(--color-text-muted)] mb-1"
                    >
                      送信までの日数
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--color-text-muted)]">+</span>
                      <input
                        type="number"
                        id="delay_days"
                        value={stepData.delay_days}
                        onChange={(e) =>
                          setStepData({ ...stepData, delay_days: parseInt(e.target.value) || 0 })
                        }
                        min="0"
                        className="w-20 px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all text-center"
                        required
                      />
                      <span className="text-sm text-[var(--color-text-muted)]">日</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="delay_time"
                      className="block text-xs text-[var(--color-text-muted)] mb-1"
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
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                      placeholder={sequence?.default_send_time || '10:00'}
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  購読登録後、何日後に送信するか。時刻が空欄の場合、デフォルト時刻（{sequence?.default_send_time || '10:00'}）を使用
                </p>
              </div>
            )}
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
