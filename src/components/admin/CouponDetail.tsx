'use client';

import { useState, useEffect } from 'react';
import {
  listCoupons,
  updateCoupon,
  listPromotionCodes,
  createPromotionCode,
  deletePromotionCode,
  type Coupon,
  type PromotionCode,
  type CreatePromotionCodeData,
} from '../../utils/admin-api';
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

export default function CouponDetail() {
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [promotionCodes, setPromotionCodes] = useState<PromotionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  // Add promotion code form state
  const [promoCode, setPromoCode] = useState('');
  const [promoMaxRedemptions, setPromoMaxRedemptions] = useState('');
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Delete promotion code modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    promoId: string;
    promoCode: string;
  }>({
    isOpen: false,
    promoId: '',
    promoCode: '',
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const couponId = new URLSearchParams(window.location.search).get('id');

  const fetchCoupon = async () => {
    if (!couponId) {
      setError('Coupon ID not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listCoupons();
    if (result.success && result.data) {
      const found = result.data.find((c) => c.id === couponId);
      if (found) {
        setCoupon(found);
        setNewName(found.name);
        setError(null);
      } else {
        setError('Coupon not found');
      }
    } else {
      setError(result.error || 'Failed to load coupon');
    }
    setLoading(false);
  };

  const fetchPromotionCodes = async () => {
    if (!couponId) return;

    const result = await listPromotionCodes(couponId);
    if (result.success && result.data) {
      setPromotionCodes(result.data);
    }
  };

  useEffect(() => {
    fetchCoupon().then(() => fetchPromotionCodes());
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponId || !newName.trim()) return;

    setNameLoading(true);
    const result = await updateCoupon(couponId, { name: newName.trim() });

    if (result.success && result.data) {
      setCoupon(result.data);
      setEditingName(false);
    } else {
      setError(result.error || 'Failed to update name');
    }
    setNameLoading(false);
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponId || !promoCode.trim()) return;

    setPromoLoading(true);
    setPromoError(null);

    const data: CreatePromotionCodeData = {
      code: promoCode.trim(),
      max_redemptions: promoMaxRedemptions ? parseInt(promoMaxRedemptions, 10) : undefined,
      expires_at: promoExpiresAt
        ? Math.floor(new Date(promoExpiresAt).getTime() / 1000)
        : undefined,
    };

    const result = await createPromotionCode(couponId, data);

    if (result.success) {
      setPromoCode('');
      setPromoMaxRedemptions('');
      setPromoExpiresAt('');
      await fetchPromotionCodes();
    } else {
      setPromoError(result.error || 'Failed to create promotion code');
    }
    setPromoLoading(false);
  };

  const handleDeletePromo = (promo: PromotionCode) => {
    setConfirmModal({
      isOpen: true,
      promoId: promo.id,
      promoCode: promo.code,
    });
  };

  const confirmDeletePromo = async () => {
    setDeleteLoading(true);
    const { promoId } = confirmModal;

    try {
      const result = await deletePromotionCode(promoId);

      if (result.success) {
        setConfirmModal({ isOpen: false, promoId: '', promoCode: '' });
        await fetchPromotionCodes();
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelDeletePromo = () => {
    setConfirmModal({ isOpen: false, promoId: '', promoCode: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-white rounded-lg p-6 h-48" />
        <div className="bg-white rounded-lg p-6 h-64" />
      </div>
    );
  }

  if (error && !coupon) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <a
          href="/admin/payments/coupons"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          クーポン一覧に戻る
        </a>
      </div>
    );
  }

  if (!coupon) return null;

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Coupon Info Section */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
        <div className="flex items-center gap-3 mb-4">
          {editingName ? (
            <form onSubmit={handleUpdateName} className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="flex-1 px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <button
                type="submit"
                disabled={nameLoading}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {nameLoading ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingName(false);
                  setNewName(coupon.name);
                }}
                className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors text-sm"
              >
                キャンセル
              </button>
            </form>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-[var(--color-text)]">{coupon.name}</h2>
              <button
                onClick={() => setEditingName(true)}
                className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                名前を編集
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">割引</p>
            <p className="text-sm font-medium text-[var(--color-text)]">{formatDiscount(coupon)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">ステータス</p>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                coupon.is_active
                  ? 'bg-green-500 text-white'
                  : 'bg-[var(--color-text-muted)] text-white'
              }`}
            >
              {coupon.is_active ? '有効' : '無効'}
            </span>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">最大利用回数</p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {coupon.max_redemptions !== null ? coupon.max_redemptions : '無制限'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">有効期限</p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {coupon.expires_at ? formatDate(coupon.expires_at) : '無期限'}
            </p>
          </div>
        </div>

        <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-4 pt-4 border-t border-[var(--color-border)]">
          <span>Stripe ID: {coupon.stripe_coupon_id}</span>
          <span>作成: {formatDate(coupon.created_at)}</span>
          <span>更新: {formatDate(coupon.updated_at)}</span>
        </div>
      </div>

      {/* Promotion Codes Section */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] mt-6">
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-4">プロモーションコード</h3>

        {/* Add Promotion Code Form */}
        <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-[var(--color-text)] mb-3">新規プロモーションコード追加</h4>
          {promoError && (
            <div className="mb-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {promoError}
            </div>
          )}
          <form onSubmit={handleCreatePromoCode} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="promo_code" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  コード <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="promo_code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                  placeholder="例: WELCOME20"
                />
              </div>
              <div>
                <label htmlFor="promo_max_redemptions" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  最大利用回数
                </label>
                <input
                  type="number"
                  id="promo_max_redemptions"
                  value={promoMaxRedemptions}
                  onChange={(e) => setPromoMaxRedemptions(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                  placeholder="無制限"
                />
              </div>
              <div>
                <label htmlFor="promo_expires_at" className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  有効期限
                </label>
                <input
                  type="datetime-local"
                  id="promo_expires_at"
                  value={promoExpiresAt}
                  onChange={(e) => setPromoExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={promoLoading}
              className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {promoLoading ? '追加中...' : 'プロモーションコードを追加'}
            </button>
          </form>
        </div>

        {/* Promotion Codes List */}
        {promotionCodes.length === 0 ? (
          <p className="text-center py-8 text-[var(--color-text-secondary)]">
            プロモーションコードがまだありません
          </p>
        ) : (
          <div className="space-y-3">
            {promotionCodes.map((promo) => (
              <div
                key={promo.id}
                className="flex items-center justify-between p-4 border border-[var(--color-border)] rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <code className="text-sm font-mono font-medium text-[var(--color-text)] bg-[var(--color-bg-tertiary)] px-2 py-1 rounded">
                      {promo.code}
                    </code>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        promo.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-[var(--color-text-muted)] text-white'
                      }`}
                    >
                      {promo.is_active ? '有効' : '無効'}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-1">
                    {promo.max_redemptions !== null && (
                      <span>最大利用回数: {promo.max_redemptions}</span>
                    )}
                    <span>
                      有効期限: {promo.expires_at ? formatDate(promo.expires_at) : '無期限'}
                    </span>
                    <span>作成: {formatDate(promo.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePromo(promo)}
                  className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors ml-4"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="プロモーションコードを削除"
        message={`プロモーションコード「${confirmModal.promoCode}」を削除してもよろしいですか？この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDeletePromo}
        onCancel={cancelDeletePromo}
        loading={deleteLoading}
        danger
      />
    </>
  );
}
