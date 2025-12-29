'use client';

import { useState, useEffect } from 'react';
import { previewTemplate, getTemplates, getBrandSettings, type TemplateInfo } from '../../utils/admin-api';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  subject: string;
  templateId?: string;
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  content,
  subject,
  templateId,
}: EmailPreviewModalProps) {
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateId || 'simple');
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      generatePreview();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && content) {
      generatePreview();
    }
  }, [selectedTemplateId]);

  async function loadTemplates() {
    const result = await getTemplates();
    if (result.success && result.data) {
      setTemplates(result.data);
    }
  }

  async function generatePreview() {
    if (!content.trim()) {
      setPreviewHtml('');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current brand settings
      const brandResult = await getBrandSettings();
      const brandSettings = brandResult.success && brandResult.data
        ? {
            logo_url: brandResult.data.logo_url,
            primary_color: brandResult.data.primary_color,
            secondary_color: brandResult.data.secondary_color,
            footer_text: brandResult.data.footer_text,
            default_template_id: brandResult.data.default_template_id,
          }
        : undefined;

      const result = await previewTemplate({
        template_id: selectedTemplateId,
        content,
        subject,
        brand_settings: brandSettings,
      });

      if (result.success && result.data) {
        setPreviewHtml(result.data.html);
      } else {
        setError(result.error || 'Failed to generate preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Email Preview
            </h2>
            <div className="flex items-center gap-4">
              {/* Template Selector */}
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* Viewport Toggle */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-md">
                <button
                  type="button"
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
                  type="button"
                  onClick={() => setViewportSize('mobile')}
                  className={`px-3 py-1 text-sm rounded ${
                    viewportSize === 'mobile'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mobile
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 bg-gray-50 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 72px)' }}>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
              </div>
            ) : previewHtml ? (
              <div
                className={`mx-auto transition-all bg-white shadow-lg rounded-lg overflow-hidden ${
                  viewportSize === 'mobile' ? 'max-w-[375px]' : 'w-full'
                }`}
              >
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[600px] border-0"
                  title="Email Preview"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg border border-gray-200">
                <div className="text-center text-gray-500">
                  <p className="mb-2">Preview not available</p>
                  <p className="text-sm">Add content to see a preview</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
            <p className="text-sm text-gray-500">
              Subject: {subject || '(No subject)'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generatePreview}
                disabled={loading}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
