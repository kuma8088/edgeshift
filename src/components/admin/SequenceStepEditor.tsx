'use client';

import { useRef } from 'react';
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
import { RichTextEditor } from './RichTextEditor';

interface SequenceStep {
  id?: string;
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}

interface SequenceStepEditorProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
}

interface SortableStepProps {
  step: SequenceStep;
  index: number;
  onUpdate: (index: number, field: keyof SequenceStep, value: string | number) => void;
  onRemove: (index: number) => void;
}

function SortableStep({ step, index, onUpdate, onRemove }: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            {...attributes}
            {...listeners}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <h4 className="text-sm font-medium text-[var(--color-text)]">
            ステップ {index + 1}
          </h4>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          削除
        </button>
      </div>

      <div>
        <label
          htmlFor={`delay_days_${index}`}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          送信までの日数 <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          id={`delay_days_${index}`}
          value={step.delay_days}
          onChange={(e) => onUpdate(index, 'delay_days', parseInt(e.target.value) || 0)}
          min="0"
          placeholder="0"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          購読登録後、何日後に送信するか（0 = 即時送信）
        </p>
      </div>

      <div>
        <label
          htmlFor={`delay_time_${index}`}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          送信時刻（オプション）
        </label>
        <input
          type="time"
          id={`delay_time_${index}`}
          value={step.delay_time || ''}
          onChange={(e) => onUpdate(index, 'delay_time', e.target.value)}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          空欄の場合、デフォルト時刻を使用
        </p>
      </div>

      <div>
        <label
          htmlFor={`subject_${index}`}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          件名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id={`subject_${index}`}
          value={step.subject}
          onChange={(e) => onUpdate(index, 'subject', e.target.value)}
          placeholder="メールの件名を入力"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
      </div>

      <div>
        <label
          htmlFor={`content_${index}`}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          本文 <span className="text-red-500">*</span>
        </label>
        <RichTextEditor
          value={step.content}
          onChange={(html) => onUpdate(index, 'content', html)}
          placeholder="メール本文を入力..."
        />
      </div>
    </div>
  );
}

export function SequenceStepEditor({ steps, onChange }: SequenceStepEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Use ref to maintain stable ID counter across renders
  const idCounterRef = useRef(0);
  const stableIdsRef = useRef(new Map<number, string>());

  // Ensure all steps have stable IDs
  const stepsWithIds = steps.map((step, index) => {
    if (step.id) {
      return step;
    }

    // Check if we already generated an ID for this position
    if (!stableIdsRef.current.has(index)) {
      stableIdsRef.current.set(index, `step-${idCounterRef.current++}`);
    }

    return {
      ...step,
      id: stableIdsRef.current.get(index)!,
    };
  });

  const addStep = () => {
    onChange([
      ...stepsWithIds,
      {
        id: `step-${idCounterRef.current++}`,
        delay_days: 0,
        delay_time: '',
        subject: '',
        content: '',
      },
    ]);
  };

  const removeStep = (index: number) => {
    const newSteps = stepsWithIds.filter((_, i) => i !== index);
    // Clean up stable ID mapping
    stableIdsRef.current.delete(index);
    onChange(newSteps);
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    const newSteps = [...stepsWithIds];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value,
    };
    onChange(newSteps);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stepsWithIds.findIndex((step) => step.id === active.id);
      const newIndex = stepsWithIds.findIndex((step) => step.id === over.id);

      const reorderedSteps = arrayMove(stepsWithIds, oldIndex, newIndex);
      onChange(reorderedSteps);
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stepsWithIds.map((step) => step.id!)}
          strategy={verticalListSortingStrategy}
        >
          {stepsWithIds.map((step, index) => (
            <SortableStep
              key={step.id}
              step={step}
              index={index}
              onUpdate={updateStep}
              onRemove={removeStep}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
      >
        + ステップを追加
      </button>
    </div>
  );
}
