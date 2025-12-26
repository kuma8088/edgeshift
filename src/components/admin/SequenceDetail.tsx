'use client';

import { useState, useEffect } from 'react';
import { getSequence, getSequenceStats, getSequenceSubscribers } from '../../utils/admin-api';
import { ProgressBar } from './ProgressBar';

interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  subject: string;
  content: string;
}

interface Sequence {
  id: string;
  name: string;
  description?: string;
  is_active: number;
  steps: SequenceStep[];
  created_at: number;
}

interface StepStats {
  step_number: number;
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
}

interface SequenceStats {
  total_enrolled: number;
  completed: number;
  in_progress: number;
  completion_rate: number;
  steps: StepStats[];
}

interface SequenceSubscriber {
  email: string;
  current_step: number;
  status: string;
  enrolled_at: number;
}

interface SequenceDetailProps {
  sequenceId: string;
}

export function SequenceDetail({ sequenceId }: SequenceDetailProps) {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [stats, setStats] = useState<SequenceStats | null>(null);
  const [subscribers, setSubscribers] = useState<SequenceSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sequenceResult, statsResult, subscribersResult] = await Promise.all([
          getSequence(sequenceId),
          getSequenceStats(sequenceId),
          getSequenceSubscribers(sequenceId),
        ]);

        if (!sequenceResult.success) {
          setError(sequenceResult.error || 'Failed to load sequence');
          setLoading(false);
          return;
        }

        const sequenceData = sequenceResult.data as { sequence: Sequence };
        setSequence(sequenceData.sequence);

        if (statsResult.success && statsResult.data) {
          const statsData = statsResult.data as { stats: SequenceStats };
          setStats(statsData.stats);
        }

        if (subscribersResult.success && subscribersResult.data) {
          const subscribersData = subscribersResult.data as {
            subscribers: SequenceSubscriber[];
          };
          setSubscribers(subscribersData.subscribers || []);
        }

        setError(null);
      } catch (err) {
        setError('Unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sequenceId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-white rounded-lg p-6 h-24" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-6 h-32" />
          ))}
        </div>
        <div className="bg-white rounded-lg p-6 h-64" />
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'シーケンスが見つかりません'}</p>
        <a
          href="/admin/sequences"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          シーケンス一覧に戻る
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              {sequence.name}
            </h1>
            {sequence.description && (
              <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                {sequence.description}
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              ステップ数: {sequence.steps?.length || 0} ·{' '}
              作成日: {new Date(sequence.created_at * 1000).toLocaleDateString('ja-JP')}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/admin/sequences/steps?id=${sequenceId}`}
              className="px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              ステップ編集
            </a>
            <a
              href="/admin/sequences"
              className="px-4 py-2 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              ← 一覧に戻る
            </a>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      {stats && (
        <section>
          <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
            全体統計
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">登録者数</p>
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {stats.total_enrolled.toLocaleString()}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">完了</p>
              <div className="mb-2">
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {stats.completed.toLocaleString()}
                </p>
              </div>
              <ProgressBar
                value={stats.completed}
                max={stats.total_enrolled}
                showPercentage={true}
                size="sm"
                color="green"
              />
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">進行中</p>
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {stats.in_progress.toLocaleString()}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Step Analysis */}
      {stats && stats.steps && stats.steps.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
            ステップ別分析
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--color-bg-tertiary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      ステップ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      配信タイミング
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      件名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      送信数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      開封率
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      クリック率
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {stats.steps.map((step) => {
                    const sequenceStep = sequence.steps?.[step.step_number - 1];
                    const delayDays = sequenceStep?.delay_days ?? 0;
                    const delayTime = sequenceStep?.delay_time;
                    const timing = delayDays === 0 && !delayTime
                      ? '即時'
                      : `+${delayDays}日${delayTime ? ` ${delayTime}` : ''}`;

                    return (
                    <tr key={step.step_number} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--color-text)]">
                        {step.step_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                        {timing}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text)]">
                        {step.subject}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {step.sent.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-[100px]">
                            <ProgressBar
                              value={step.opened}
                              max={step.sent}
                              showPercentage={true}
                              size="sm"
                              color="blue"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-[100px]">
                            <ProgressBar
                              value={step.clicked}
                              max={step.sent}
                              showPercentage={true}
                              size="sm"
                              color="green"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Subscribers */}
      <section>
        <h2 className="text-lg font-medium text-[var(--color-text-secondary)] mb-4">
          登録者一覧
        </h2>
        {subscribers.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--color-bg-tertiary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      メールアドレス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      現在のステップ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {subscribers.map((subscriber, index) => (
                    <tr key={index} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {subscriber.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                        {subscriber.current_step}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            subscriber.status === 'completed'
                              ? 'bg-green-500 text-white'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {subscriber.status === 'completed' ? '完了' : '進行中'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-12 shadow-sm border border-[var(--color-border)] text-center">
            <p className="text-[var(--color-text-secondary)]">
              まだ登録者がいません
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
