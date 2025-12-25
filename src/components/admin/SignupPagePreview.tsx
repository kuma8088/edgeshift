'use client';

import { useState } from 'react';
import type { SignupPage } from '../../utils/admin-api';

interface SignupPagePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  page: Partial<SignupPage>;
}

export function SignupPagePreview({ isOpen, onClose, page }: SignupPagePreviewProps) {
  const [activeTab, setActiveTab] = useState<'signup' | 'pending' | 'confirmed'>('signup');

  if (!isOpen) return null;

  const formFields = page.form_fields || 'email';
  const hasNameField = formFields.includes('name');

  // Close modal on ESC key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id="preview-title" className="text-xl font-bold text-gray-900">
            プレビュー
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="閉じる"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('signup')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'signup'
                ? 'text-gray-800 border-b-2 border-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            登録ページ
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'pending'
                ? 'text-gray-800 border-b-2 border-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            仮登録完了ページ
          </button>
          <button
            onClick={() => setActiveTab('confirmed')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'confirmed'
                ? 'text-gray-800 border-b-2 border-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            確認完了ページ
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Signup Page Preview */}
          {activeTab === 'signup' && (
            <div className="p-8 bg-gray-50">
              <div className="max-w-2xl mx-auto">
                {/* Page Content */}
                <div className="mb-8">
                  {page.content ? (
                    <div
                      className="prose prose-lg max-w-none"
                      dangerouslySetInnerHTML={{ __html: page.content }}
                    />
                  ) : (
                    <p className="text-gray-400 italic">本文が入力されていません</p>
                  )}
                </div>

                {/* Signup Form */}
                <div className="bg-white rounded-lg shadow-lg p-8">
                  <div className="space-y-4">
                    {/* Email Field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        メールアドレス <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="example@email.com"
                        disabled
                        className="w-full px-4 py-3 rounded border border-gray-300 bg-gray-50"
                      />
                    </div>

                    {/* Name Field (if enabled) */}
                    {hasNameField && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          お名前 <span className="text-gray-500 text-xs">(任意)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="山田 太郎"
                          disabled
                          className="w-full px-4 py-3 rounded border border-gray-300 bg-gray-50"
                        />
                      </div>
                    )}

                    {/* Turnstile Placeholder */}
                    <div className="bg-gray-100 border border-gray-300 rounded p-4 text-center text-sm text-gray-500">
                      Cloudflare Turnstile CAPTCHA
                    </div>

                    {/* Submit Button */}
                    <div>
                      <button
                        type="button"
                        disabled
                        className="w-full bg-gray-800 text-white px-6 py-3 rounded font-medium"
                      >
                        {page.button_text || '登録する'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Page Preview */}
          {activeTab === 'pending' && (
            <div className="py-24 px-4 bg-gray-50">
              <div className="max-w-lg mx-auto text-center">
                {/* Icon */}
                <div className="mb-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100">
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                  {page.pending_title || '確認メールを送信しました'}
                </h1>

                {/* Message */}
                <p className="text-gray-700 mb-8 leading-relaxed">
                  {page.pending_message || 'メール内のリンクをクリックして登録を完了してください。'}
                </p>

                {/* Back to Home */}
                <button
                  type="button"
                  disabled
                  className="inline-block bg-gray-800 text-white px-6 py-3 rounded font-medium"
                >
                  トップページへ戻る
                </button>
              </div>
            </div>
          )}

          {/* Confirmed Page Preview */}
          {activeTab === 'confirmed' && (
            <div className="py-24 px-4 bg-gray-50">
              <div className="max-w-lg mx-auto text-center">
                {/* Icon */}
                <div className="mb-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                  {page.confirmed_title || '登録が完了しました'}
                </h1>

                {/* Message */}
                <p className="text-gray-700 mb-8 leading-relaxed">
                  {page.confirmed_message || 'ニュースレターへのご登録ありがとうございます。'}
                </p>

                {/* Back to Home */}
                <button
                  type="button"
                  disabled
                  className="inline-block bg-gray-800 text-white px-6 py-3 rounded font-medium"
                >
                  トップページへ戻る
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
