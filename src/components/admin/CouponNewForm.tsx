'use client';

import { useState } from 'react';
import { createCoupon, type CreateCouponData } from '../../utils/admin-api';

export default function CouponNewForm() {
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'percent_off' | 'amount_off'>('percent_off');
  const [discountValue, setDiscountValue] = useState('');
  const [currency, setCurrency] = useState('jpy');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data: CreateCouponData = {
      name,
      discount_type: discountType,
      discount_value: parseFloat(discountValue),
      currency: discountType === 'amount_off' ? currency : undefined,
      max_redemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : undefined,
      expires_at: expiresAt
        ? Math.floor(new Date(expiresAt).getTime() / 1000)
        : undefined,
    };

    const result = await createCoupon(data);

    if (result.success) {
      window.location.href = '/admin/payments/coupons';
    } else {
      setError(result.error || 'Failed to create coupon');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/payments/coupons';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            クーポン名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="例: 新規登録20%OFF"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="discount_type" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              割引タイプ <span className="text-red-500">*</span>
            </label>
            <select
              id="discount_type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent_off' | 'amount_off')}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="percent_off">割引率 (%)</option>
              <option value="amount_off">割引額 (固定)</option>
            </select>
          </div>

          <div>
            <label htmlFor="discount_value" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              割引値 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="discount_value"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              required
              min="0"
              step={discountType === 'percent_off' ? '1' : '1'}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder={discountType === 'percent_off' ? '例: 20' : '例: 500'}
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {discountType === 'percent_off' ? 'パーセンテージ (1-100)' : '割引額 (通貨単位)'}
            </p>
          </div>
        </div>

        {discountType === 'amount_off' && (
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              通貨
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="jpy">JPY (日本円)</option>
              <option value="usd">USD (米ドル)</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor="max_redemptions" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            最大利用回数
          </label>
          <input
            type="number"
            id="max_redemptions"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            min="1"
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="未設定の場合は無制限"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">空欄の場合、利用回数に制限はありません</p>
        </div>

        <div>
          <label htmlFor="expires_at" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            有効期限
          </label>
          <input
            type="datetime-local"
            id="expires_at"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">空欄の場合、無期限になります</p>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '作成中...' : '作成'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
        </div>
      </form>
    </>
  );
}
