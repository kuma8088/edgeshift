'use client';

import { useState, useEffect } from 'react';
import {
  getSignupPage,
  createSignupPage,
  updateSignupPage,
  getSequences,
  type Sequence,
  type PageType,
} from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';
import { SignupPagePreview } from './SignupPagePreview';
import { ListSelector } from './ListSelector';
import { EmbedCodeGenerator } from './EmbedCodeGenerator';

interface SignupPageEditFormProps {
  pageId?: string;
}

export function SignupPageEditForm({ pageId }: SignupPageEditFormProps) {
  const isEditMode = Boolean(pageId);

  // Form state - Basic
  const [slug, setSlug] = useState('');
  const [sequenceId, setSequenceId] = useState<string>('');
  const [contactListId, setContactListId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [theme, setTheme] = useState('default');

  // Form state - Page type
  const [pageType, setPageType] = useState<PageType>('landing');

  // Form state - Shared fields
  const [buttonText, setButtonText] = useState('登録する');
  const [formFields, setFormFields] = useState('email,name');
  const [emailLabel, setEmailLabel] = useState('メールアドレス');
  const [emailPlaceholder, setEmailPlaceholder] = useState('your@email.com');
  const [nameLabel, setNameLabel] = useState('お名前');
  const [namePlaceholder, setNamePlaceholder] = useState('山田太郎');
  const [successMessage, setSuccessMessage] = useState('登録ありがとうございます！確認メールをお送りしました。');

  // Form state - Landing page only
  const [pendingTitle, setPendingTitle] = useState('確認メールを送信しました');
  const [pendingMessage, setPendingMessage] = useState(
    'メール内のリンクをクリックして登録を完了してください。'
  );
  const [confirmedTitle, setConfirmedTitle] = useState('登録が完了しました');
  const [confirmedMessage, setConfirmedMessage] = useState(
    'ニュースレターへのご登録ありがとうございます。'
  );

  // Form state - Embed page only
  const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('light');
  const [embedSize, setEmbedSize] = useState<'compact' | 'full'>('full');

  // UI state
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load sequences
  useEffect(() => {
    loadSequences();
  }, []);

  // Load page data if editing
  useEffect(() => {
    if (pageId) {
      loadPage();
    }
  }, [pageId]);

  async function loadSequences() {
    try {
      const result = await getSequences();
      if (result.success && result.data) {
        setSequences(result.data.sequences || []);
      }
    } catch (err) {
      console.error('Failed to load sequences:', err);
    }
  }

  async function loadPage() {
    if (!pageId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await getSignupPage(pageId);
      if (result.success && result.data) {
        const data = result.data.page;
        setSlug(data.slug);
        setSequenceId(data.sequence_id || '');
        setContactListId(data.contact_list_id || null);
        setTitle(data.title);
        setContent(data.content);
        setTheme(data.theme);

        // Page type (default to 'landing' for backward compatibility)
        setPageType(data.page_type || 'landing');

        // Shared fields
        setButtonText(data.button_text);
        setFormFields(data.form_fields);
        setEmailLabel(data.email_label || 'メールアドレス');
        setEmailPlaceholder(data.email_placeholder || 'your@email.com');
        setNameLabel(data.name_label || 'お名前');
        setNamePlaceholder(data.name_placeholder || '山田太郎');
        setSuccessMessage(data.success_message || '登録ありがとうございます！確認メールをお送りしました。');

        // Landing page fields
        setPendingTitle(data.pending_title);
        setPendingMessage(data.pending_message);
        setConfirmedTitle(data.confirmed_title);
        setConfirmedMessage(data.confirmed_message);

        // Embed page fields
        setEmbedTheme(data.embed_theme || 'light');
        setEmbedSize(data.embed_size || 'full');
      } else {
        setError(result.error || 'Failed to load page');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const pageData = {
        slug,
        sequence_id: sequenceId || undefined,
        contact_list_id: contactListId || undefined,
        title,
        content,
        theme,
        page_type: pageType,
        // Shared fields
        button_text: buttonText,
        form_fields: formFields,
        email_label: emailLabel,
        email_placeholder: emailPlaceholder,
        name_label: nameLabel,
        name_placeholder: namePlaceholder,
        success_message: successMessage,
        // Landing page fields
        pending_title: pendingTitle,
        pending_message: pendingMessage,
        confirmed_title: confirmedTitle,
        confirmed_message: confirmedMessage,
        // Embed page fields
        embed_theme: embedTheme,
        embed_size: embedSize,
      };

      let result;
      if (isEditMode && pageId) {
        result = await updateSignupPage(pageId, pageData);
      } else {
        result = await createSignupPage(pageData);
      }

      if (result.success) {
        window.location.href = '/admin/signup-pages';
      } else {
        setError(result.error || 'Failed to save page');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save page');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEditMode ? 'ページを編集' : '新しいページを作成'}
      </h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Page Type Selection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ページタイプ</h2>
          <div className="space-y-3">
            <label className="flex items-start cursor-pointer">
              <input
                type="radio"
                name="page_type"
                value="landing"
                checked={pageType === 'landing'}
                onChange={(e) => setPageType(e.target.value as PageType)}
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-gray-900">ランディングページ</div>
                <div className="text-sm text-gray-500">
                  確認フローを含む独立したページ（/newsletter/signup/[slug]）
                </div>
              </div>
            </label>
            <label className="flex items-start cursor-pointer">
              <input
                type="radio"
                name="page_type"
                value="embed"
                checked={pageType === 'embed'}
                onChange={(e) => setPageType(e.target.value as PageType)}
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-gray-900">埋め込みページ</div>
                <div className="text-sm text-gray-500">
                  iframe で埋め込み可能なコンパクトフォーム
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Basic Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">基本設定</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                URL（スラッグ） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]{3,50}"
                placeholder="tech-weekly"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
              <p className="mt-1 text-sm text-gray-500">
                英小文字、数字、ハイフンのみ（3〜50文字）
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                シーケンス
              </label>
              <select
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              >
                <option value="">（シーケンスなし）</option>
                {sequences.map((seq) => (
                  <option key={seq.id} value={seq.id}>
                    {seq.name}
                  </option>
                ))}
              </select>
            </div>

            <ListSelector
              value={contactListId}
              onChange={setContactListId}
              label="自動割り当てリスト（オプション）"
              allowNull
            />

            {pageType === 'landing' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  テーマ
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                >
                  <option value="default">サイトデフォルト</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ページ内容
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="技術ニュースレター登録"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                本文 <span className="text-red-500">*</span>
              </label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="ページの説明を入力してください..."
              />
            </div>
          </div>
        </div>

        {/* Form Settings - Shared */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            フォーム設定
          </h2>

          <div className="space-y-4">
            {/* Form Fields Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                フォーム項目
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formFields.includes('email')}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        // Email is always required
                        return;
                      }
                    }}
                    disabled
                    className="mr-2"
                  />
                  メール（必須）
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formFields.includes('name')}
                    onChange={(e) => {
                      setFormFields(e.target.checked ? 'email,name' : 'email');
                    }}
                    className="mr-2"
                  />
                  名前
                </label>
              </div>
            </div>

            {/* Email Field Customization */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  メールフィールド ラベル
                </label>
                <input
                  type="text"
                  value={emailLabel}
                  onChange={(e) => setEmailLabel(e.target.value)}
                  placeholder="メールアドレス"
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  プレースホルダー
                </label>
                <input
                  type="text"
                  value={emailPlaceholder}
                  onChange={(e) => setEmailPlaceholder(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                />
              </div>
            </div>

            {/* Name Field Customization (conditional) */}
            {formFields.includes('name') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    名前フィールド ラベル
                  </label>
                  <input
                    type="text"
                    value={nameLabel}
                    onChange={(e) => setNameLabel(e.target.value)}
                    placeholder="お名前"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    プレースホルダー
                  </label>
                  <input
                    type="text"
                    value={namePlaceholder}
                    onChange={(e) => setNamePlaceholder(e.target.value)}
                    placeholder="山田太郎"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>
              </div>
            )}

            {/* Button Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                送信ボタンテキスト
              </label>
              <input
                type="text"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="登録する"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>

            {/* Success Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                送信成功メッセージ
              </label>
              <textarea
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                rows={2}
                placeholder="登録ありがとうございます！確認メールをお送りしました。"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Landing Page Only - Confirmation Pages */}
        {pageType === 'landing' && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                確認待ちページ設定（Landing Page）
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    タイトル
                  </label>
                  <input
                    type="text"
                    value={pendingTitle}
                    onChange={(e) => setPendingTitle(e.target.value)}
                    placeholder="確認メールを送信しました"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    メッセージ
                  </label>
                  <textarea
                    value={pendingMessage}
                    onChange={(e) => setPendingMessage(e.target.value)}
                    rows={3}
                    placeholder="メール内のリンクをクリックして登録を完了してください。"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                完了ページ設定（Landing Page）
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    タイトル
                  </label>
                  <input
                    type="text"
                    value={confirmedTitle}
                    onChange={(e) => setConfirmedTitle(e.target.value)}
                    placeholder="登録が完了しました"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    メッセージ
                  </label>
                  <textarea
                    value={confirmedMessage}
                    onChange={(e) => setConfirmedMessage(e.target.value)}
                    rows={3}
                    placeholder="ニュースレターへのご登録ありがとうございます。"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Embed Page Only - Embed Customization */}
        {pageType === 'embed' && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                埋め込み設定（Embed Page）
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    テーマ
                  </label>
                  <select
                    value={embedTheme}
                    onChange={(e) => setEmbedTheme(e.target.value as 'light' | 'dark')}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  >
                    <option value="light">ライト（明るい背景）</option>
                    <option value="dark">ダーク（暗い背景）</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    埋め込み先のサイトデザインに合わせて選択してください
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    サイズ
                  </label>
                  <select
                    value={embedSize}
                    onChange={(e) => setEmbedSize(e.target.value as 'compact' | 'full')}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
                  >
                    <option value="compact">コンパクト（300px）</option>
                    <option value="full">フル（600px）</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    埋め込み先のスペースに合わせて選択してください
                  </p>
                </div>
              </div>
            </div>

            {/* Embed Code Generator - Only for saved pages */}
            {isEditMode && pageId && (
              <EmbedCodeGenerator
                pageId={pageId}
                slug={slug}
                embedTheme={embedTheme}
                embedSize={embedSize}
              />
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            プレビュー
          </button>
          <a
            href="/admin/signup-pages"
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            キャンセル
          </a>
        </div>
      </form>

      {/* Preview Modal */}
      <SignupPagePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        page={{
          slug,
          sequence_id: sequenceId || null,
          title,
          content,
          button_text: buttonText,
          form_fields: formFields,
          theme,
          page_type: pageType,
          pending_title: pendingTitle,
          pending_message: pendingMessage,
          confirmed_title: confirmedTitle,
          confirmed_message: confirmedMessage,
          embed_theme: embedTheme,
          embed_size: embedSize,
          email_label: emailLabel,
          email_placeholder: emailPlaceholder,
          name_label: nameLabel,
          name_placeholder: namePlaceholder,
          success_message: successMessage,
        }}
      />
    </div>
  );
}
