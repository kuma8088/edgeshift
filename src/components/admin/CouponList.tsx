'use client';

import { useState, useEffect } from 'react';
import { listCoupons, deleteCoupon, type Coupon } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount_type === 'percent_off') {
    return `${coupon.discount_value}% OFF`;
  }
  return `\u00a5${coupon.discount_value.toLocaleString()} OFF`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('ja-JP');
}

export function CouponList() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    couponId: string;
    couponName: string;
  }>({
    isOpen: false,
    couponId: '',
    couponName: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCoupons = async () => {
    setLoading(true);
    const result = await listCoupons();
    if (result.success && result.data) {
      setCoupons(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load coupons');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleDelete = (coupon: Coupon) => {
    setConfirmModal({
      isOpen: true,
      couponId: coupon.id,
      couponName: coupon.name,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    const { couponId } = confirmModal;

    try {
      const result = await deleteCoupon(couponId);

      if (result.success) {
        setConfirmModal({ isOpen: false, couponId: '', couponName: '' });
        await fetchCoupons();
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
    setConfirmModal({ isOpen: false, couponId: '', couponName: '' });
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
          onClick={fetchCoupons}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (coupons.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)] mb-4">クーポンがまだありません</p>
        <a
          href="/admin/payments/coupons/new"
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
        {coupons.map((coupon) => (
          <div
            key={coupon.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-[var(--color-text)]">
                    {coupon.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      coupon.is_active
                        ? 'bg-green-500 text-white'
                        : 'bg-[var(--color-text-muted)] text-white'
                    }`}
                  >
                    {coupon.is_active ? '有効' : '無効'}
                  </span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500 text-white">
                    {formatDiscount(coupon)}
                  </span>
                </div>
                <div className="flex gap-4 text-sm">
                  {coupon.max_redemptions !== null && (
                    <span className="text-[var(--color-text-secondary)]">
                      最大利用回数: <span className="font-medium">{coupon.max_redemptions}</span>
                    </span>
                  )}
                  <span className="text-[var(--color-text-secondary)]">
                    有効期限:{' '}
                    <span className="font-medium">
                      {coupon.expires_at ? formatDate(coupon.expires_at) : '無期限'}
                    </span>
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-2">
                  <span>作成: {formatDate(coupon.created_at)}</span>
                  <span>更新: {formatDate(coupon.updated_at)}</span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <a
                  href={`/admin/payments/coupons/detail?id=${coupon.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  詳細
                </a>
                <button
                  onClick={() => handleDelete(coupon)}
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
        title="クーポンを削除"
        message={`「${confirmModal.couponName}」を削除してもよろしいですか？この操作は取り消せません。`}
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
