'use client';

import { useState, type FormEvent } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { ListSelector } from './ListSelector';

interface Campaign {
  id?: string;
  subject: string;
  content: string;
  contact_list_id?: string | null;
  scheduled_at?: number;
  status?: string;
  slug?: string;
  is_published?: boolean;
  excerpt?: string;
}

interface CampaignFormProps {
  campaign?: Campaign;
  onSubmit: (data: { subject: string; content: string; contact_list_id?: string; scheduled_at?: number; slug?: string; is_published?: boolean; excerpt?: string }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CampaignForm({ campaign, onSubmit, onCancel, loading = false }: CampaignFormProps) {
  const [subject, setSubject] = useState(campaign?.subject || '');
  const [content, setContent] = useState(campaign?.content || '');
  const [contactListId, setContactListId] = useState<string | null>(campaign?.contact_list_id || null);
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduled_at
      ? new Date(campaign.scheduled_at * 1000).toISOString().slice(0, 16)
      : ''
  );
  const [slug, setSlug] = useState(campaign?.slug || '');
  const [isPublished, setIsPublished] = useState(campaign?.is_published || false);
  const [excerpt, setExcerpt] = useState(campaign?.excerpt || '');
  const [error, setError] = useState('');

  const generateSlug = () => {
    if (!subject.trim()) {
      setError('件名を入力してからスラッグを生成してください');
      return;
    }
    const generated = subject
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generated);
  };

  const generateExcerpt = () => {
    if (!content.trim()) {
      setError('本文を入力してから要約を生成してください');
      return;
    }
    // Strip HTML tags and extract first 150 characters
    const plainText = content.replace(/<[^>]*>/g, '').trim();
    const generated = plainText.length > 150
      ? plainText.substring(0, 150) + '...'
      : plainText;
    setExcerpt(generated);
  };

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

    const data: { subject: string; content: string; contact_list_id?: string; scheduled_at?: number; slug?: string; is_published?: boolean; excerpt?: string } = {
      subject: subject.trim(),
      content: content.trim(),
      contact_list_id: contactListId || undefined,
    };

    if (scheduledAt) {
      const timestamp = Math.floor(new Date(scheduledAt).getTime() / 1000);
      data.scheduled_at = timestamp;
    }

    if (slug.trim()) {
      data.slug = slug.trim();
    }

    data.is_published = isPublished;

    if (excerpt.trim()) {
      data.excerpt = excerpt.trim();
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
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="メール本文を入力..."
        />
      </div>

      <ListSelector
        value={contactListId}
        onChange={setContactListId}
        label="配信対象リスト（オプション）"
        allowNull
      />

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

      <div className="border-t border-[var(--color-border)] pt-6">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          アーカイブ設定
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              スラッグ（URL）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="newsletter-slug"
                className="flex-1 px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={generateSlug}
                className="px-4 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-border)] transition-colors"
              >
                自動生成
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              アーカイブページのURL: /newsletter/archive/{slug || 'your-slug'}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                アーカイブに公開
              </span>
            </label>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 ml-6">
              チェックを入れると、このニュースレターがアーカイブページに表示されます
            </p>
          </div>

          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              要約
            </label>
            <div className="space-y-2">
              <textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="ニュースレターの要約を入力..."
                rows={3}
                className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all resize-none"
              />
              <button
                type="button"
                onClick={generateExcerpt}
                className="px-4 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-border)] transition-colors text-sm"
              >
                本文から自動生成
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              アーカイブページに表示される概要文です（150文字程度推奨）
            </p>
          </div>
        </div>
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
