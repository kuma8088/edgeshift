'use client';

import { useState, useRef } from 'react';
import { createCampaign } from '../../utils/admin-api';
import { CampaignForm, type CampaignFormRef } from './CampaignForm';
import { AIContentGenerator } from './AIContentGenerator';

export default function CampaignNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const formRef = useRef<CampaignFormRef>(null);

  const handleSubmit = async (data: { subject: string; content: string; template_id?: string; scheduled_at?: number }) => {
    setLoading(true);
    setError(null);

    const result = await createCampaign(data);

    if (result.success) {
      // Redirect to campaigns list
      window.location.href = '/admin/campaigns';
    } else {
      setError(result.error || 'Failed to create campaign');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/campaigns';
  };

  const handleSubjectSelected = (subject: string) => {
    formRef.current?.setSubject(subject);
  };

  const handleContentGenerated = (content: string) => {
    formRef.current?.setContent(content);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* AI Assistant Toggle - Collapsible panel above editor */}
      <div>
        <button
          type="button"
          onClick={() => setShowAI(!showAI)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
            showAI
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
          AI アシスタント
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 transition-transform ${showAI ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* AI Assistant Panel - Collapsible */}
        {showAI && (
          <div className="mt-3 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100">
            <AIContentGenerator
              onSubjectSelected={handleSubjectSelected}
              onContentGenerated={handleContentGenerated}
            />
          </div>
        )}
      </div>

      {/* Campaign Form with 2-column layout */}
      <CampaignForm
        ref={formRef}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </div>
  );
}
