'use client';

import { useState, useEffect } from 'react';
import {
  getBrandSettings,
  updateBrandSettings,
  getTemplates,
  previewTemplate,
  testSendTemplate,
  type BrandSettings,
  type TemplateInfo,
} from '../../utils/admin-api';

export function BrandSettingsForm() {
  const [_settings, setSettings] = useState<BrandSettings | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#7c3aed');
  const [secondaryColor, setSecondaryColor] = useState('#1e1e1e');
  const [footerText, setFooterText] = useState('EdgeShift Newsletter');
  const [emailSignature, setEmailSignature] = useState('');
  const [defaultTemplateId, setDefaultTemplateId] = useState('simple');

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewportSize, setViewportSize] = useState<'desktop' | 'mobile'>('desktop');

  // Test send state
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [settingsRes, templatesRes] = await Promise.all([
        getBrandSettings(),
        getTemplates(),
      ]);

      if (settingsRes.success && settingsRes.data) {
        const s = settingsRes.data;
        setSettings(s);
        setLogoUrl(s.logo_url || '');
        setPrimaryColor(s.primary_color || '#7c3aed');
        setSecondaryColor(s.secondary_color || '#1e1e1e');
        setFooterText(s.footer_text || 'EdgeShift Newsletter');
        setEmailSignature(s.email_signature || '');
        setDefaultTemplateId(s.default_template_id || 'simple');
      }

      if (templatesRes.success && templatesRes.data) {
        setTemplates(templatesRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateBrandSettings({
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        footer_text: footerText,
        email_signature: emailSignature,
        default_template_id: defaultTemplateId,
      });

      if (result.success) {
        setSuccess('ブランド設定を保存しました');
        if (result.data) {
          setSettings(result.data);
        }
      } else {
        setError(result.error || 'Failed to save settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setError(null);

    try {
      const result = await previewTemplate({
        template_id: defaultTemplateId,
        content: `<p>これはプレビュー用のサンプルテキストです。</p>
<p>実際のニュースレターでは、ここにコンテンツが入ります。</p>
<p><a href="https://edgeshift.tech">リンクのサンプル</a></p>`,
        subject: 'プレビュー: ニュースレターサンプル',
        brand_settings: {
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          footer_text: footerText,
          email_signature: emailSignature,
          default_template_id: defaultTemplateId,
        },
      });

      if (result.success && result.data) {
        setPreviewHtml(result.data.html);
      } else {
        setError(result.error || 'Failed to generate preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleTestSend(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail) return;

    setTestSending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await testSendTemplate({
        template_id: defaultTemplateId,
        content: `<p>これはテスト送信用のサンプルテキストです。</p>
<p>ブランド設定が正しく反映されているか確認してください。</p>`,
        subject: 'テスト送信: ブランド設定確認',
        to: testEmail,
      });

      if (result.success) {
        setSuccess(`テストメールを ${testEmail} に送信しました`);
        setTestEmail('');
      } else {
        setError(result.error || 'Failed to send test email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setTestSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-600">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ブランド設定</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ロゴ URL
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                placeholder="https://example.com/logo.png"
              />
              <p className="mt-1 text-xs text-gray-500">
                メールヘッダーに表示されるロゴ画像のURL
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プライマリカラー
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  セカンダリカラー
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メール署名
              </label>
              <textarea
                value={emailSignature}
                onChange={(e) => setEmailSignature(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent resize-y"
                placeholder="山田 太郎&#10;EdgeShift&#10;https://edgeshift.tech"
              />
              <p className="mt-1 text-xs text-gray-500">
                メール本文の後、フッターの前に表示される署名。改行は保持されます。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                フッターテキスト
              </label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                placeholder="EdgeShift Newsletter"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルトテンプレート
              </label>
              <select
                value={defaultTemplateId}
                onChange={(e) => setDefaultTemplateId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} - {t.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '設定を保存'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {previewLoading ? 'プレビュー中...' : 'プレビュー'}
              </button>
            </div>
          </form>

          {/* Test Send */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">テスト送信</h3>
            <form onSubmit={handleTestSend} className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                required
              />
              <button
                type="submit"
                disabled={testSending || !testEmail}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors disabled:opacity-50"
              >
                {testSending ? '送信中...' : '送信'}
              </button>
            </form>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">プレビュー</h2>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-md">
              <button
                onClick={() => setViewportSize('desktop')}
                className={`px-3 py-1 text-sm rounded ${
                  viewportSize === 'desktop'
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                PC
              </button>
              <button
                onClick={() => setViewportSize('mobile')}
                className={`px-3 py-1 text-sm rounded ${
                  viewportSize === 'mobile'
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                モバイル
              </button>
            </div>
          </div>

          {previewHtml ? (
            <div
              className={`border border-gray-200 rounded-lg overflow-hidden mx-auto transition-all ${
                viewportSize === 'mobile' ? 'max-w-[375px]' : 'w-full'
              }`}
            >
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[500px] border-0"
                title="Email Preview"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-[500px] bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-center text-gray-500">
                <p className="mb-2">プレビューがありません</p>
                <p className="text-sm">「プレビュー」ボタンをクリックしてください</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">利用可能なテンプレート</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                t.id === defaultTemplateId
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => setDefaultTemplateId(t.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{t.name}</h3>
                {t.id === defaultTemplateId && (
                  <span className="text-xs bg-gray-800 text-white px-2 py-0.5 rounded">
                    デフォルト
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">{t.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
