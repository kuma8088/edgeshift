'use client';

import { useState, type FormEvent } from 'react';

interface Campaign {
  id?: string;
  subject: string;
  content: string;
  scheduled_at?: number;
  status?: string;
}

interface CampaignFormProps {
  campaign?: Campaign;
  onSubmit: (data: { subject: string; content: string; scheduled_at?: number }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CampaignForm({ campaign, onSubmit, onCancel, loading = false }: CampaignFormProps) {
  const [subject, setSubject] = useState(campaign?.subject || '');
  const [content, setContent] = useState(campaign?.content || '');
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduled_at
      ? new Date(campaign.scheduled_at * 1000).toISOString().slice(0, 16)
      : ''
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!subject.trim()) {
      setError('件名を入力してください');
      return;
    }

    if (!content.trim()) {
      setError('本文を入力してください');
      return;
    }

    const data: { subject: string; content: string; scheduled_at?: number } = {
      subject: subject.trim(),
      content: content.trim(),
    };

    if (scheduledAt) {
      const timestamp = Math.floor(new Date(scheduledAt).getTime() / 1000);
      data.scheduled_at = timestamp;
    }

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          件名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="メールの件名を入力"
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          required
        />
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          本文 <span className="text-red-500">*</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="メール本文を入力"
          rows={12}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all font-mono text-sm"
          required
        />
      </div>

      <div>
        <label htmlFor="scheduledAt" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          送信予約日時（オプション）
        </label>
        <input
          type="datetime-local"
          id="scheduledAt"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          未設定の場合は下書きとして保存されます
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : campaign?.id ? '更新' : '作成'}
        </button>
      </div>
    </form>
  );
}
