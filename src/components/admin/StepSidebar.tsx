'use client';

import { useState } from 'react';

interface Step {
  step_number: number;
  subject: string;
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number | null;
}

interface StepSidebarProps {
  sequenceId: string;
  steps: Step[];
  currentStep: number;
  onNavigate: (step: number) => void;
  onAddStep: () => void;
  isMobileOpen?: boolean;
  onMobileToggle?: () => void;
  defaultSendTime?: string;
}

export function StepSidebar({
  sequenceId,
  steps,
  currentStep,
  onNavigate,
  onAddStep,
  isMobileOpen = false,
  onMobileToggle,
  defaultSendTime = '10:00',
}: StepSidebarProps) {
  // Helper to format timing display
  const formatTiming = (step: Step): string | null => {
    // delay_minutes mode (immediate or +Xm)
    if (step.delay_minutes !== null && step.delay_minutes !== undefined) {
      if (step.delay_minutes === 0) {
        return '即時送信';
      }
      return `+${step.delay_minutes}m`;
    }

    // delay_days mode
    const time = step.delay_time || defaultSendTime;
    if (step.delay_days === 0) {
      return `当日 ${time}`;
    }
    return `+${step.delay_days}日 ${time}`;
  };
  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={onMobileToggle}
        className="lg:hidden fixed bottom-4 right-4 z-50 bg-[var(--color-accent)] text-white p-3 rounded-full shadow-lg hover:bg-opacity-90 transition-all"
        aria-label="Toggle step navigation"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen lg:h-auto
          w-64 bg-white border-r border-[var(--color-border)]
          transition-transform duration-300 z-40
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                ステップ一覧
              </h3>
              <button
                type="button"
                onClick={onMobileToggle}
                className="lg:hidden text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                aria-label="Close navigation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <a
              href={`/admin/sequences/steps?id=${sequenceId}`}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              ← 一覧に戻る
            </a>
          </div>

          {/* Step list */}
          <nav className="flex-1 p-4 space-y-2">
            {steps.map((step) => {
              const isActive = step.step_number === currentStep;
              return (
                <button
                  key={step.step_number}
                  type="button"
                  onClick={() => onNavigate(step.step_number)}
                  className={`
                    w-full text-left p-3 rounded-lg transition-all
                    ${
                      isActive
                        ? 'bg-[var(--color-accent)] text-white shadow-sm'
                        : 'bg-[var(--color-bg-secondary)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>
                      ステップ {step.step_number}
                    </span>
                    {formatTiming(step) && (
                      <span className={`text-xs ${isActive ? 'text-white opacity-90' : 'text-[var(--color-text-muted)]'}`}>
                        ({formatTiming(step)})
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-[var(--color-text)]'}`}>
                    {step.subject || '（件名なし）'}
                  </p>
                </button>
              );
            })}
          </nav>

          {/* Add step button */}
          <div className="sticky bottom-0 bg-white border-t border-[var(--color-border)] p-4">
            <button
              type="button"
              onClick={onAddStep}
              className="w-full py-2 px-4 border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors text-sm"
            >
              + ステップを追加
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}
    </>
  );
}
