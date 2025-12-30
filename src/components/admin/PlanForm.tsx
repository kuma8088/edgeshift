'use client';

import { useState } from 'react';
import type { Plan, CreatePlanData } from '../../utils/admin-api';

interface PlanFormProps {
  plan?: Plan;
  onSubmit: (data: CreatePlanData & { is_active?: number }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function PlanForm({ plan, onSubmit, onCancel, loading = false }: PlanFormProps) {
  const [name, setName] = useState(plan?.name || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [priceCents, setPriceCents] = useState(plan?.price_cents.toString() || '');
  const [planType, setPlanType] = useState<'monthly' | 'yearly' | 'lifetime'>(plan?.plan_type || 'monthly');
  const [stripePriceId, setStripePriceId] = useState(plan?.stripe_price_id || '');
  const [isActive, setIsActive] = useState(plan?.is_active !== 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreatePlanData & { is_active?: number } = {
      name,
      description: description || undefined,
      price_cents: parseInt(priceCents, 10),
      plan_type: planType,
      stripe_price_id: stripePriceId || undefined,
    };

    if (plan) {
      data.is_active = isActive ? 1 : 0;
    }

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          プラン名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: プレミアム月額プラン"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          説明
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="プランの説明を入力"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="price_cents" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            価格 (円) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="price_cents"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            required
            min="0"
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="例: 980"
          />
        </div>

        <div>
          <label htmlFor="plan_type" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            プランタイプ <span className="text-red-500">*</span>
          </label>
          <select
            id="plan_type"
            value={planType}
            onChange={(e) => setPlanType(e.target.value as 'monthly' | 'yearly' | 'lifetime')}
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="monthly">月額</option>
            <option value="yearly">年額</option>
            <option value="lifetime">買い切り</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="stripe_price_id" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          Stripe Price ID
        </label>
        <input
          type="text"
          id="stripe_price_id"
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: price_1234567890"
        />
      </div>

      {plan && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-[var(--color-accent)]"
          />
          <label htmlFor="is_active" className="text-sm font-medium text-[var(--color-text)]">
            有効
          </label>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : plan ? '更新' : '作成'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
