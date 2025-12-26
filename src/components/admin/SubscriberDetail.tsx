'use client';

import { useState, useEffect } from 'react';
import { getSubscriber, type Subscriber } from '../../utils/admin-api';
import { SubscriberListsSection } from './SubscriberListsSection';

interface Props {
  subscriberId: string;
}

export function SubscriberDetail({ subscriberId }: Props) {
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriber();
  }, [subscriberId]);

  async function loadSubscriber() {
    setLoading(true);
    setError(null);

    try {
      const result = await getSubscriber(subscriberId);
      if (result.success && result.data) {
        setSubscriber(result.data.subscriber);
      } else {
        setError(result.error || 'Failed to load subscriber');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriber');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (error || !subscriber) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Failed to load subscriber'}</p>
        <a
          href="/admin/subscribers"
          className="text-[var(--color-accent)] underline hover:no-underline"
        >
          購読者一覧に戻る
        </a>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'unsubscribed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return '有効';
      case 'pending':
        return '保留中';
      case 'unsubscribed':
        return '購読解除';
      default:
        return status;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <a
          href="/admin/contact-lists"
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-4 inline-block"
        >
          ← リスト一覧に戻る
        </a>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
          購読者詳細
        </h1>
      </div>

      {/* Subscriber Info */}
      <div className="bg-white border border-[var(--color-border)] rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">基本情報</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-[var(--color-text-secondary)] block mb-1">Email</label>
            <p className="text-[var(--color-text)] font-medium">{subscriber.email}</p>
          </div>

          {subscriber.name && (
            <div>
              <label className="text-sm text-[var(--color-text-secondary)] block mb-1">名前</label>
              <p className="text-[var(--color-text)]">{subscriber.name}</p>
            </div>
          )}

          <div>
            <label className="text-sm text-[var(--color-text-secondary)] block mb-1">ステータス</label>
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(subscriber.status)}`}>
              {getStatusLabel(subscriber.status)}
            </span>
          </div>

          {subscriber.subscribed_at && (
            <div>
              <label className="text-sm text-[var(--color-text-secondary)] block mb-1">購読日時</label>
              <p className="text-[var(--color-text)]">
                {new Date(subscriber.subscribed_at * 1000).toLocaleString('ja-JP')}
              </p>
            </div>
          )}

          {subscriber.unsubscribed_at && (
            <div>
              <label className="text-sm text-[var(--color-text-secondary)] block mb-1">購読解除日時</label>
              <p className="text-[var(--color-text)]">
                {new Date(subscriber.unsubscribed_at * 1000).toLocaleString('ja-JP')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lists Section */}
      <SubscriberListsSection subscriberId={subscriberId} />
    </div>
  );
}
