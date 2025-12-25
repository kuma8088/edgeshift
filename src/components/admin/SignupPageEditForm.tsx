'use client';

import { useState, useEffect } from 'react';
import {
  getSignupPage,
  createSignupPage,
  updateSignupPage,
  getSequences,
  type Sequence,
} from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';
import { SignupPagePreview } from './SignupPagePreview';
import { ListSelector } from './ListSelector';

interface SignupPageEditFormProps {
  pageId?: string;
}

export function SignupPageEditForm({ pageId }: SignupPageEditFormProps) {
  const isEditMode = Boolean(pageId);

  // Form state
  const [slug, setSlug] = useState('');
  const [sequenceId, setSequenceId] = useState<string>('');
  const [contactListId, setContactListId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [buttonText, setButtonText] = useState('登録する');
  const [formFields, setFormFields] = useState('email,name');
  const [theme, setTheme] = useState('default');
  const [pendingTitle, setPendingTitle] = useState('確認メールを送信しました');
  const [pendingMessage, setPendingMessage] = useState(
    'メール内のリンクをクリックして登録を完了してください。'
  );
  const [confirmedTitle, setConfirmedTitle] = useState('登録が完了しました');
  const [confirmedMessage, setConfirmedMessage] = useState(
    'ニュースレターへのご登録ありがとうございます。'
  );

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
        setButtonText(data.button_text);
        setFormFields(data.form_fields);
        setTheme(data.theme);
        setPendingTitle(data.pending_title);
        setPendingMessage(data.pending_message);
        setConfirmedTitle(data.confirmed_title);
        setConfirmedMessage(data.confirmed_message);
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
        button_text: buttonText,
        form_fields: formFields,
        theme,
        pending_title: pendingTitle,
        pending_message: pendingMessage,
        confirmed_title: confirmedTitle,
        confirmed_message: confirmedMessage,
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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

        {/* Button Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ボタン設定
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ボタンテキスト
            </label>
            <input
              type="text"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="登録する"
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
            />
          </div>
        </div>

        {/* Pending Page Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            仮登録ページ設定
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
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Confirmed Page Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            完了ページ設定
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
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-800"
              />
            </div>
          </div>
        </div>

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
          pending_title: pendingTitle,
          pending_message: pendingMessage,
          confirmed_title: confirmedTitle,
          confirmed_message: confirmedMessage,
        }}
      />
    </div>
  );
}
