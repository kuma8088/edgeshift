'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getSequence, updateSequence, type Sequence } from '../../utils/admin-api';

interface SequenceStepListProps {
  sequenceId: string;
}

interface Step {
  id: string;
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}

interface SortableStepCardProps {
  step: Step;
  index: number;
  sequenceId: string;
  onDelete: (index: number) => void;
}

function SortableStepCard({ step, index, sequenceId, onDelete }: SortableStepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm('このステップを削除してもよろしいですか？')) {
      onDelete(index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-[var(--color-border)] rounded-lg p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[var(--color-text-muted)] hover:text-[var(--color-text)] mt-1"
          {...attributes}
          {...listeners}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-[var(--color-text)]">
              ステップ {index + 1}
            </span>
            {step.delay_days > 0 && (
              <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-1 rounded">
                +{step.delay_days}日
                {step.delay_time && ` ${step.delay_time}`}
              </span>
            )}
          </div>

          <h4 className="text-base font-medium text-[var(--color-text)] mb-1 truncate">
            {step.subject || '（件名なし）'}
          </h4>

          <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mb-3">
            {step.content.replace(/<[^>]*>/g, '').substring(0, 100)}...
          </p>

          <div className="flex gap-2">
            <a
              href={`/admin/sequences/steps/edit?id=${sequenceId}&step=${index + 1}`}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              編集
            </a>
            <button
              type="button"
              onClick={handleDelete}
              className="text-sm text-red-500 hover:underline"
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SequenceStepList({ sequenceId }: SequenceStepListProps) {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Unique ID counter to avoid collisions after delete+add
  const idCounterRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadSequence();
  }, [sequenceId]);

  const loadSequence = async (clearError = true) => {
    setLoading(true);
    if (clearError) {
      setError(null);
    }

    const result = await getSequence(sequenceId);
    const responseData = result.data as { sequence?: Sequence } | undefined;
    if (result.success && responseData?.sequence) {
      const seq = responseData.sequence;
      setSequence(seq);
      const stepsWithIds = (seq.steps || []).map((step: Omit<Step, 'id'>) => ({
        id: `step-${idCounterRef.current++}`,
        ...step,
      }));
      setSteps(stepsWithIds);
    } else {
      setError(result.error || 'シーケンスの読み込みに失敗しました');
    }

    setLoading(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex((step) => step.id === active.id);
      const newIndex = steps.findIndex((step) => step.id === over.id);

      const reorderedSteps = arrayMove(steps, oldIndex, newIndex);

      // Apply auto-sort logic to DnD reordered steps
      const defaultTime = sequence?.default_send_time || '10:00';
      const sortedSteps = [...reorderedSteps].sort((a, b) => {
        if (a.delay_days !== b.delay_days) {
          return a.delay_days - b.delay_days;
        }
        const timeA = a.delay_time || defaultTime;
        const timeB = b.delay_time || defaultTime;
        return timeA.localeCompare(timeB);
      });

      setSteps(sortedSteps);

      // Save to backend
      await saveSteps(sortedSteps);
    }
  };

  const handleDelete = async (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(newSteps);
    await saveSteps(newSteps);
  };

  const handleAddStep = async () => {
    const newStep: Step = {
      id: `step-${idCounterRef.current++}`,
      delay_days: 0,
      delay_time: '',
      subject: '',
      content: '',
    };
    const newSteps = [...steps, newStep];

    // Sort steps by delay_days, then by delay_time (use default_send_time for empty)
    const defaultTime = sequence?.default_send_time || '10:00';
    const sortedSteps = [...newSteps].sort((a, b) => {
      if (a.delay_days !== b.delay_days) {
        return a.delay_days - b.delay_days;
      }
      const timeA = a.delay_time || defaultTime;
      const timeB = b.delay_time || defaultTime;
      return timeA.localeCompare(timeB);
    });

    setSteps(sortedSteps);
    await saveSteps(sortedSteps);

    // Find position of the new step by ID and navigate to it
    const newPosition = sortedSteps.findIndex((s) => s.id === newStep.id);
    window.location.href = `/admin/sequences/steps/edit?id=${sequenceId}&step=${newPosition + 1}`;
  };

  const saveSteps = async (updatedSteps: Step[]) => {
    setSaving(true);

    const stepsData = updatedSteps.map(({ id, ...step }) => step);
    const result = await updateSequence(sequenceId, { steps: stepsData });

    if (result.success) {
      // Clear any previous error on successful save
      setError(null);
    } else {
      setError(result.error || '保存に失敗しました。再読み込みします...');
      // Reload to restore correct state from backend (keep error visible)
      await loadSequence(false);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--color-text-muted)]">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text)]">{sequence?.name}</h2>
          {sequence?.description && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{sequence.description}</p>
          )}
        </div>
        <a
          href={`/admin/sequences/edit?id=${sequenceId}`}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          ← シーケンス設定に戻る
        </a>
      </div>

      {/* Steps list */}
      {steps.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-bg-secondary)] rounded-lg border border-dashed border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)] mb-4">まだステップが登録されていません</p>
          <button
            type="button"
            onClick={handleAddStep}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            最初のステップを追加
          </button>
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((step) => step.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <SortableStepCard
                    key={step.id}
                    step={step}
                    index={index}
                    sequenceId={sequenceId}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={handleAddStep}
            className="w-full py-3 border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            + ステップを追加
          </button>
        </>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-[var(--color-accent)] text-white px-4 py-2 rounded-lg shadow-lg">
          保存中...
        </div>
      )}
    </div>
  );
}
