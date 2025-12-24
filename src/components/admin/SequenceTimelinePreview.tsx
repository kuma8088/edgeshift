'use client';

interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
}

interface SequenceTimelinePreviewProps {
  defaultSendTime: string;
  steps: SequenceStep[];
}

export function SequenceTimelinePreview({ defaultSendTime, steps }: SequenceTimelinePreviewProps) {
  if (steps.length === 0) {
    return null;
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
      <h4 className="text-sm font-medium text-[var(--color-text)] mb-4">
        送信タイムライン（プレビュー）
      </h4>
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-[var(--color-border)]" />

        {/* Registration point */}
        <div className="relative mb-4">
          <div className="absolute left-[-18px] w-3 h-3 rounded-full bg-[var(--color-accent)] border-2 border-white" />
          <span className="text-xs text-[var(--color-text-muted)]">購読登録</span>
        </div>

        {/* Steps */}
        {steps.map((step, index) => {
          const sendTime = step.delay_time || defaultSendTime;
          const dayLabel = step.delay_days === 0
            ? '即時'
            : `${step.delay_days}日後`;

          return (
            <div key={index} className="relative mb-4 last:mb-0">
              <div className="absolute left-[-18px] w-3 h-3 rounded-full bg-[var(--color-bg)] border-2 border-[var(--color-accent)]" />
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-[var(--color-accent)] min-w-[80px]">
                  {dayLabel} ({formatTime(sendTime)})
                </span>
                <span className="text-sm text-[var(--color-text)]">
                  {step.subject || `ステップ ${index + 1}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
