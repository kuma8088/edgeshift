'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, type FormEvent } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { ListSelector } from './ListSelector';
import { TemplateSelector } from './TemplateSelector';
import { ReplyToSelector } from './ReplyToSelector';
import { EmailPreviewModal } from './EmailPreviewModal';
import { sendTestEmail } from '../../utils/admin-api';

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
  reply_to?: string | null;
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
    reply_to?: string;
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
  const isReadOnly = campaign?.status === 'sent';

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    setSubject: (newSubject: string) => setSubject(newSubject),
    setContent: (newContent: string) => setContent(newContent),
  }), []);
  const [contactListId, setContactListId] = useState<string | null>(campaign?.contact_list_id || null);
  const [templateId, setTemplateId] = useState<string | undefined>(campaign?.template_id || undefined);
  const [replyTo, setReplyTo] = useState<string | null>(campaign?.reply_to || null);
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

  // Test send state
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSendError, setTestSendError] = useState('');
  const [testSendSuccess, setTestSendSuccess] = useState('');
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

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

  const handleTestSend = async () => {
    // Validate template is selected (required by backend)
    if (!templateId) {
      setTestSendError('テンプレートを選択してください');
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setTestSendError(''), 5000);
      return;
    }

    const email = window.prompt('テストメールの送信先アドレスを入力してください:');
    if (!email || !email.trim()) return;

    // Proper email validation (matches backend regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      alert('有効なメールアドレスを入力してください');
      return;
    }

    setIsSendingTest(true);
    setTestSendError('');
    setTestSendSuccess('');
    // Clear any existing timeouts
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);

    try {
      // templateId is guaranteed to be defined here (checked above)
      const result = await sendTestEmail({
        to: email.trim(),
        subject: subject.trim(),
        content: content.trim(),
        templateId: templateId!, // Non-null assertion (validated above)
      });

      if (result.success) {
        setTestSendSuccess(`テストメールを ${email} に送信しました`);
        successTimeoutRef.current = setTimeout(() => setTestSendSuccess(''), 3000);
      } else {
        setTestSendError(result.error || 'テストメールの送信に失敗しました');
        errorTimeoutRef.current = setTimeout(() => setTestSendError(''), 5000);
      }
    } catch (err) {
      console.error('Test send error:', err);
      setTestSendError('テストメールの送信に失敗しました');
      errorTimeoutRef.current = setTimeout(() => setTestSendError(''), 5000);
    } finally {
      setIsSendingTest(false);
    }
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
      reply_to?: string;
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
      reply_to: replyTo || undefined,
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
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 2-column layout: Editor (left flexible) + Settings (right 320-380px) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,380px)] gap-6">
        {/* Left Column: Email Content Editor (styled as email preview) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              メール本文
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!content.trim()}
                className="px-3 py-1.5 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                プレビュー
              </button>
              <button
                type="button"
                onClick={handleTestSend}
                disabled={!content.trim() || !subject.trim() || isSendingTest || isReadOnly}
                className="px-3 py-1.5 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSendingTest ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                {isSendingTest ? '送信中...' : 'テスト送信'}
              </button>
            </div>
          </div>

          {/* Test send success/error messages */}
          {testSendSuccess && (
            <div className="p-2 bg-green-50 text-green-700 rounded-lg text-sm">
              {testSendSuccess}
            </div>
          )}
          {testSendError && (
            <div className="p-2 bg-red-50 text-red-600 rounded-lg text-sm">
              {testSendError}
            </div>
          )}

          {/* Rich Text Editor styled as email preview */}
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="メール本文を入力..."
            emailPreviewStyle
            disabled={isReadOnly}
          />
        </div>

        {/* Right Column: Settings Panel */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-6">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-5 border border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              配信設定
            </h2>

            <div className="space-y-5">
              {/* Subject */}
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
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                  disabled={isReadOnly}
                />
              </div>

              {/* Template Selector */}
              <TemplateSelector
                value={templateId}
                onChange={setTemplateId}
                label="メールテンプレート"
                disabled={isReadOnly}
              />

              {/* Reply-To Address */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  返信先アドレス
                </label>
                <ReplyToSelector
                  value={replyTo}
                  onChange={setReplyTo}
                  disabled={isReadOnly}
                />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  返信先を指定しない場合、デフォルトのアドレスが使用されます
                </p>
              </div>

              {/* Contact List Selector */}
              <ListSelector
                value={contactListId}
                onChange={setContactListId}
                label="配信対象リスト"
                allowNull
                disabled={isReadOnly}
              />

              {/* Schedule */}
              <div>
                <label htmlFor="scheduledAt" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  送信予約日時
                </label>
                <input
                  type="datetime-local"
                  id="scheduledAt"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={isReadOnly}
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  未設定の場合は下書きとして保存
                </p>
              </div>

              {/* A/B Test Settings - only show when scheduled */}
              {scheduledAt && (
                <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                  <label className={`flex items-center gap-2 ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={abTestEnabled}
                      onChange={(e) => setAbTestEnabled(e.target.checked)}
                      className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-2 focus:ring-[var(--color-accent)]"
                      disabled={isReadOnly}
                    />
                    <span className="font-medium text-[var(--color-text-primary)] text-sm">A/Bテストを有効にする</span>
                  </label>

                  {abTestEnabled && (
                    <div className="space-y-4 p-3 bg-white rounded-lg border border-[var(--color-border)]">
                      <div>
                        <label htmlFor="abSubjectB" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                          件名B <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="abSubjectB"
                          value={abSubjectB}
                          onChange={(e) => setAbSubjectB(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          placeholder="テストする別の件名"
                          required={abTestEnabled}
                          disabled={isReadOnly}
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
                          className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          placeholder="テストする別の送信者名"
                          disabled={isReadOnly}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                          待機時間
                        </label>
                        <div className="flex gap-3">
                          {([1, 2, 4] as const).map((hours) => (
                            <label key={hours} className={`flex items-center ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input
                                type="radio"
                                name="abWaitHours"
                                value={hours}
                                checked={abWaitHours === hours}
                                onChange={() => setAbWaitHours(hours)}
                                className="mr-1.5 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                                disabled={isReadOnly}
                              />
                              <span className="text-xs text-[var(--color-text-secondary)]">{hours}時間</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="text-xs text-[var(--color-text-secondary)] bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                        <p className="font-medium text-blue-800 mb-1">配信スケジュール</p>
                        <p className="text-blue-700">テスト: {formatTestTime(scheduledAt, abWaitHours)}</p>
                        <p className="text-blue-700">本配信: {formatTime(scheduledAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Archive Settings */}
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-5 border border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              アーカイブ設定
            </h2>

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
                    className="flex-1 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isReadOnly}
                  />
                  <button
                    type="button"
                    onClick={generateSlug}
                    className="px-3 py-2 text-xs bg-white text-[var(--color-text-secondary)] rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isReadOnly}
                  >
                    自動生成
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  /newsletter/archive/{slug || 'your-slug'}
                </p>
              </div>

              <div>
                <label className={`flex items-center gap-2 ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-2 focus:ring-[var(--color-accent)]"
                    disabled={isReadOnly}
                  />
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                    アーカイブに公開
                  </span>
                </label>
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
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all resize-none bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isReadOnly}
                  />
                  <button
                    type="button"
                    onClick={generateExcerpt}
                    className="px-3 py-1.5 text-xs bg-white text-[var(--color-text-secondary)] rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isReadOnly}
                  >
                    本文から自動生成
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading || isReadOnly}
              className="flex-1 px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? '保存中...' : campaign?.id ? '更新' : '作成'}
            </button>
          </div>
        </div>
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
