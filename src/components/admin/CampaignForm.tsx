'use client';

import { useState, forwardRef, useImperativeHandle, type FormEvent } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { ListSelector } from './ListSelector';
import { TemplateSelector } from './TemplateSelector';
import { EmailPreviewModal } from './EmailPreviewModal';

export interface CampaignFormRef {
  setSubject: (subject: string) => void;
  setContent: (content: string) => void;
}

interface Campaign {
  id?: string;
  subject: string;
  content: string;
  contact_list_id?: string | null;
  template_id?: string | null;
  scheduled_at?: number;
  status?: string;
  slug?: string;
  is_published?: boolean;
  excerpt?: string;
  ab_test_enabled?: boolean;
  ab_subject_b?: string | null;
  ab_from_name_b?: string | null;
  ab_wait_hours?: number | null;
}

interface CampaignFormProps {
  campaign?: Campaign;
  onSubmit: (data: {
    subject: string;
    content: string;
    contact_list_id?: string;
    template_id?: string;
    scheduled_at?: number;
    slug?: string;
    is_published?: boolean;
    excerpt?: string;
    ab_test_enabled?: boolean;
    ab_subject_b?: string | null;
    ab_from_name_b?: string | null;
    ab_wait_hours?: number | null;
  }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const CampaignForm = forwardRef<CampaignFormRef, CampaignFormProps>(function CampaignForm(
  { campaign, onSubmit, onCancel, loading = false },
  ref
) {
  const [subject, setSubject] = useState(campaign?.subject || '');
  const [content, setContent] = useState(campaign?.content || '');

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    setSubject: (newSubject: string) => setSubject(newSubject),
    setContent: (newContent: string) => setContent(newContent),
  }), []);
  const [contactListId, setContactListId] = useState<string | null>(campaign?.contact_list_id || null);
  const [templateId, setTemplateId] = useState<string | undefined>(campaign?.template_id || undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduled_at
      ? new Date(campaign.scheduled_at * 1000).toISOString().slice(0, 16)
      : ''
  );
  const [slug, setSlug] = useState(campaign?.slug || '');
  const [isPublished, setIsPublished] = useState(campaign?.is_published || false);
  const [excerpt, setExcerpt] = useState(campaign?.excerpt || '');
  const [error, setError] = useState('');

  // A/B test state
  const [abTestEnabled, setAbTestEnabled] = useState(campaign?.ab_test_enabled || false);
  const [abSubjectB, setAbSubjectB] = useState(campaign?.ab_subject_b || '');
  const [abFromNameB, setAbFromNameB] = useState(campaign?.ab_from_name_b || '');
  const [abWaitHours, setAbWaitHours] = useState<1 | 2 | 4>(
    (campaign?.ab_wait_hours as 1 | 2 | 4) || 4
  );

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

  // A/B test time formatting helpers
  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTestTime = (dateStr: string, waitHours: number): string => {
    const date = new Date(dateStr);
    date.setHours(date.getHours() - waitHours);
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

    // Validate A/B test settings
    if (abTestEnabled && !abSubjectB.trim()) {
      setError('A/Bテストを有効にする場合は件名Bを入力してください');
      return;
    }

    const data: {
      subject: string;
      content: string;
      contact_list_id?: string;
      template_id?: string;
      scheduled_at?: number;
      slug?: string;
      is_published?: boolean;
      excerpt?: string;
      ab_test_enabled?: boolean;
      ab_subject_b?: string | null;
      ab_from_name_b?: string | null;
      ab_wait_hours?: number | null;
    } = {
      subject: subject.trim(),
      content: content.trim(),
      contact_list_id: contactListId || undefined,
      template_id: templateId || undefined,
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

    // Add A/B test settings
    data.ab_test_enabled = abTestEnabled;
    data.ab_subject_b = abTestEnabled ? abSubjectB.trim() : null;
    data.ab_from_name_b = abTestEnabled && abFromNameB.trim() ? abFromNameB.trim() : null;
    data.ab_wait_hours = abTestEnabled ? abWaitHours : null;

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

      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <TemplateSelector
            value={templateId}
            onChange={setTemplateId}
            label="メールテンプレート"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          disabled={!content.trim()}
          className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview
        </button>
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

      {/* A/B Test Settings - only show when scheduled */}
      {scheduledAt && (
        <div className="space-y-4 border-t border-[var(--color-border)] pt-4 mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={abTestEnabled}
              onChange={(e) => setAbTestEnabled(e.target.checked)}
              className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <span className="font-medium text-[var(--color-text-primary)]">A/Bテストを有効にする</span>
          </label>

          {abTestEnabled && (
            <div className="ml-6 space-y-4 p-4 bg-[var(--color-bg-secondary)] rounded-lg">
              <div>
                <label htmlFor="abSubjectB" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  件名B <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="abSubjectB"
                  value={abSubjectB}
                  onChange={(e) => setAbSubjectB(e.target.value)}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                  placeholder="テストする別の件名"
                  required={abTestEnabled}
                />
              </div>

              <div>
                <label htmlFor="abFromNameB" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  送信者名B（オプション）
                </label>
                <input
                  type="text"
                  id="abFromNameB"
                  value={abFromNameB}
                  onChange={(e) => setAbFromNameB(e.target.value)}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                  placeholder="テストする別の送信者名"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  待機時間
                </label>
                <div className="flex gap-4">
                  {([1, 2, 4] as const).map((hours) => (
                    <label key={hours} className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="abWaitHours"
                        value={hours}
                        checked={abWaitHours === hours}
                        onChange={() => setAbWaitHours(hours)}
                        className="mr-2 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                      />
                      <span className="text-sm text-[var(--color-text-secondary)]">{hours}時間</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  テスト配信から本配信までの待機時間
                </p>
              </div>

              <div className="text-sm text-[var(--color-text-secondary)] bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="font-medium text-blue-800 mb-1">配信スケジュール</p>
                <p className="text-blue-700">
                  テスト配信: {formatTestTime(scheduledAt, abWaitHours)}
                </p>
                <p className="text-blue-700">
                  本配信: {formatTime(scheduledAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

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

      <EmailPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        content={content}
        subject={subject}
        templateId={templateId}
      />
    </form>
  );
});
