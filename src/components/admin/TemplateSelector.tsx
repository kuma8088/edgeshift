'use client';

import { useState, useEffect } from 'react';
import { getTemplates, type TemplateInfo } from '../../utils/admin-api';

interface TemplateSelectorProps {
  value: string | undefined;
  onChange: (templateId: string | undefined) => void;
  label?: string;
  showDefault?: boolean;
  disabled?: boolean;
}

export function TemplateSelector({
  value,
  onChange,
  label = 'Template',
  showDefault = true,
  disabled = false,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const result = await getTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      } else {
        setError(result.error || 'Failed to load templates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
        {label}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
        disabled={disabled}
      >
        {showDefault && (
          <option value="">Default Template</option>
        )}
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} - {t.description}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        Select a template for this email. Leave empty to use the default from brand settings.
      </p>
    </div>
  );
}
