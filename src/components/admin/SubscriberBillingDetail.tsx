'use client';

import { useState, useEffect } from 'react';
import {
  getSubscriberBilling,
  refundSubscription,
  refundPurchase,
  type SubscriberBillingInfo,
} from '../../utils/admin-api';

interface Props {
  subscriberId: string;
}

const statusLabels: Record<string, string> = {
  active: '有効',
  past_due: '支払い遅延',
  canceled: '解約済',
  unpaid: '未払い',
  lifetime: '永久会員',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-gray-100 text-gray-800',
  unpaid: 'bg-red-100 text-red-800',
  lifetime: 'bg-purple-100 text-purple-800',
};

const planTypeLabels: Record<string, string> = {
  monthly: '月額',
  yearly: '年額',
  lifetime: '買い切り',
};

const paymentTypeLabels: Record<string, string> = {
  subscription: '購読',
  one_time: '単発',
  refund: '返金',
};

const purchaseStatusLabels: Record<string, string> = {
  pending: '処理中',
  completed: '完了',
  refunded: '返金済',
};

const purchaseStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  refunded: 'bg-red-100 text-red-800',
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ja-JP');
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('ja-JP');
}

function formatPrice(cents: number): string {
  return `\u00a5${Math.abs(cents).toLocaleString()}`;
}

export function SubscriberBillingDetail({ subscriberId }: Props) {
  const [billingInfo, setBillingInfo] = useState<SubscriberBillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    type: 'subscription' | 'purchase';
    id: string;
    name: string;
  }>({
    isOpen: false,
    type: 'subscription',
    id: '',
    name: '',
  });
  const [refundReason, setRefundReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBillingInfo = async () => {
    setLoading(true);
    setError(null);
    const result = await getSubscriberBilling(subscriberId);
    if (result.success && result.data) {
      setBillingInfo(result.data);
    } else {
      setError(result.error || 'Failed to load billing info');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBillingInfo();
  }, [subscriberId]);

  const handleRefundClick = (type: 'subscription' | 'purchase', id: string, name: string) => {
    setRefundModal({ isOpen: true, type, id, name });
    setRefundReason('');
  };

  const confirmRefund = async () => {
    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = refundModal.type === 'subscription'
        ? await refundSubscription(refundModal.id, refundReason || undefined)
        : await refundPurchase(refundModal.id, refundReason || undefined);

      if (result.success) {
        setActionMessage({ type: 'success', text: '返金処理が完了しました' });
        setRefundModal({ isOpen: false, type: 'subscription', id: '', name: '' });
        await fetchBillingInfo();
      } else {
        setActionMessage({ type: 'error', text: result.error || '返金処理に失敗しました' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: '予期しないエラーが発生しました' });
    } finally {
      setActionLoading(false);
    }
  };

  const cancelRefund = () => {
    setRefundModal({ isOpen: false, type: 'subscription', id: '', name: '' });
    setRefundReason('');
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-white rounded-lg h-32" />
        <div className="bg-white rounded-lg h-48" />
        <div className="bg-white rounded-lg h-48" />
      </div>
    );
  }

  if (error || !billingInfo) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Failed to load billing info'}</p>
        <a
          href="/admin/payments/billing"
          className="text-[var(--color-accent)] underline hover:no-underline"
        >
          購読者一覧に戻る
        </a>
      </div>
    );
  }

  const { subscriptions, payments, purchases } = billingInfo;
  const subscriberEmail = subscriptions[0]?.subscriber_email || purchases[0]?.subscriber_id || subscriberId;
  const subscriberName = subscriptions[0]?.subscriber_name;

  return (
    <div>
      <div className="mb-6">
        <a
          href="/admin/payments/billing"
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-4 inline-block"
        >
          &larr; 購読者一覧に戻る
        </a>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">請求情報</h1>
        <p className="text-[var(--color-text)]">{subscriberEmail}</p>
        {subscriberName && (
          <p className="text-sm text-[var(--color-text-secondary)]">{subscriberName}</p>
        )}
      </div>

      {actionMessage && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            actionMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Subscriptions Section */}
      <div className="bg-white border border-[var(--color-border)] rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">サブスクリプション</h2>
        {subscriptions.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">サブスクリプションはありません</p>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="border border-[var(--color-border)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-[var(--color-text)]">{subscription.plan_name}</span>
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {planTypeLabels[subscription.plan_type] || subscription.plan_type}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${statusColors[subscription.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[subscription.status] || subscription.status}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] space-y-1">
                      <p>開始日: {formatDate(subscription.created_at)}</p>
                      {subscription.current_period_start && subscription.current_period_end && (
                        <p>
                          現在の期間: {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                        </p>
                      )}
                      {subscription.stripe_subscription_id && (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Stripe: {subscription.stripe_subscription_id}
                        </p>
                      )}
                    </div>
                  </div>
                  {subscription.status === 'active' && (
                    <button
                      onClick={() => handleRefundClick('subscription', subscription.id, subscription.plan_name)}
                      className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      返金
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchases Section */}
      <div className="bg-white border border-[var(--color-border)] rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">購入商品</h2>
        {purchases.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">購入商品はありません</p>
        ) : (
          <div className="space-y-4">
            {purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="border border-[var(--color-border)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-[var(--color-text)]">{purchase.product_name}</span>
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {purchase.product_type}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${purchaseStatusColors[purchase.status] || 'bg-gray-100 text-gray-800'}`}>
                        {purchaseStatusLabels[purchase.status] || purchase.status}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] space-y-1">
                      <p>購入日: {formatDateTime(purchase.created_at)}</p>
                    </div>
                  </div>
                  {purchase.status === 'completed' && (
                    <button
                      onClick={() => handleRefundClick('purchase', purchase.id, purchase.product_name)}
                      className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      返金
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History Section */}
      <div className="bg-white border border-[var(--color-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">支払い履歴</h2>
        {payments.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">支払い履歴はありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">日時</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">種別</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">ステータス</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">金額</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                      {formatDateTime(payment.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {paymentTypeLabels[payment.payment_type] || payment.payment_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {payment.status}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${
                      payment.payment_type === 'refund' ? 'text-red-600' : 'text-[var(--color-text)]'
                    }`}>
                      {payment.payment_type === 'refund' ? '-' : ''}{formatPrice(payment.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={cancelRefund} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">返金処理</h3>
            <p className="text-[var(--color-text-secondary)] mb-4">
              「{refundModal.name}」を返金しますか？
            </p>
            <div className="mb-4">
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                返金理由（任意）
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[var(--color-text)] resize-none"
                rows={3}
                placeholder="返金理由を入力してください..."
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelRefund}
                disabled={actionLoading}
                className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                onClick={confirmRefund}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? '処理中...' : '返金する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
