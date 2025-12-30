'use client';

import { useState, useEffect } from 'react';
import { listPlans, deletePlan, type Plan } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

const planTypeLabels = {
  monthly: '月額',
  yearly: '年額',
  lifetime: '買い切り',
};

function formatPrice(cents: number): string {
  return `\u00a5${cents.toLocaleString()}`;
}

export function PlanList() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    planId: string;
    planName: string;
  }>({
    isOpen: false,
    planId: '',
    planName: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    const result = await listPlans();
    if (result.success && result.data) {
      setPlans(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load plans');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleDelete = (plan: Plan) => {
    setConfirmModal({
      isOpen: true,
      planId: plan.id,
      planName: plan.name,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    const { planId } = confirmModal;

    try {
      const result = await deletePlan(planId);

      if (result.success) {
        setConfirmModal({ isOpen: false, planId: '', planName: '' });
        await fetchPlans();
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelDelete = () => {
    setConfirmModal({ isOpen: false, planId: '', planName: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchPlans}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)] mb-4">プランがまだありません</p>
        <a
          href="/admin/payments/plans/new"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          新規作成
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-[var(--color-text)]">
                    {plan.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      plan.is_active
                        ? 'bg-green-500 text-white'
                        : 'bg-[var(--color-text-muted)] text-white'
                    }`}
                  >
                    {plan.is_active ? '有効' : '無効'}
                  </span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500 text-white">
                    {planTypeLabels[plan.plan_type]}
                  </span>
                </div>
                {plan.description && (
                  <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                    {plan.description}
                  </p>
                )}
                <div className="flex gap-4 text-sm">
                  <span className="text-[var(--color-text)]">
                    <span className="font-medium">{formatPrice(plan.price_cents)}</span>
                  </span>
                  {plan.stripe_price_id && (
                    <span className="text-[var(--color-text-muted)]">
                      Stripe: {plan.stripe_price_id}
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-2">
                  <span>作成: {new Date(plan.created_at * 1000).toLocaleString('ja-JP')}</span>
                  <span>更新: {new Date(plan.updated_at * 1000).toLocaleString('ja-JP')}</span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <a
                  href={`/admin/payments/plans/edit?id=${plan.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  編集
                </a>
                <button
                  onClick={() => handleDelete(plan)}
                  className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="プランを削除"
        message={`「${confirmModal.planName}」を削除してもよろしいですか？この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={actionLoading}
        danger
      />
    </>
  );
}
