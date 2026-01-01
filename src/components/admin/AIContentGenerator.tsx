'use client';

import { useState } from 'react';
import { generateContent, suggestSubjects } from '../../utils/admin-api';

interface AIContentGeneratorProps {
  onContentGenerated?: (content: string) => void;
  onSubjectSelected?: (subject: string) => void;
}

export function AIContentGenerator({
  onContentGenerated,
  onSubjectSelected,
}: AIContentGeneratorProps) {
  // Subject suggestion state
  const [topic, setTopic] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Content generation state
  const [prompt, setPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  const handleSuggestSubjects = async () => {
    if (!topic.trim()) return;

    setLoadingSubjects(true);
    setError(null);
    setSubjects([]);

    try {
      const result = await suggestSubjects(topic);
      if (result.success && result.data) {
        setSubjects(result.data.subjects);
      } else {
        setError(result.error || 'Failed to suggest subjects');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest subjects');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!prompt.trim()) return;

    setLoadingContent(true);
    setError(null);
    setGeneratedContent('');

    try {
      const result = await generateContent(prompt);
      if (result.success && result.data) {
        setGeneratedContent(result.data.content);
      } else {
        setError(result.error || 'Failed to generate content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSelectSubject = (subject: string) => {
    onSubjectSelected?.(subject);
  };

  const handleUseContent = () => {
    if (generatedContent) {
      onContentGenerated?.(generatedContent);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Subject Suggestions */}
      <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          件名の提案
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="ニュースレターのトピックを入力..."
            className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSuggestSubjects();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSuggestSubjects}
            disabled={loadingSubjects || !topic.trim()}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap"
          >
            {loadingSubjects ? '生成中...' : '提案する'}
          </button>
        </div>
        {subjects.length > 0 && (
          <ul className="space-y-2">
            {subjects.map((subject, index) => (
              <li
                key={`subject-${index}-${subject.slice(0, 20)}`}
                className="flex items-center justify-between bg-[var(--color-bg-primary)] p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] cursor-pointer transition-colors"
                onClick={() => handleSelectSubject(subject)}
              >
                <span className="text-sm text-[var(--color-text-primary)]">{subject}</span>
                <button
                  type="button"
                  className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] text-sm font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectSubject(subject);
                  }}
                >
                  使用
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Content Generation */}
      <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          コンテンツ生成
        </h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="生成したいコンテンツの説明を入力...&#10;例: TypeScriptの型安全性についての解説記事。初心者向けに分かりやすく説明してください。"
          rows={4}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent text-sm resize-none mb-3"
        />
        <button
          type="button"
          onClick={handleGenerateContent}
          disabled={loadingContent || !prompt.trim()}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {loadingContent ? '生成中...' : 'コンテンツを生成'}
        </button>
        {generatedContent && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">生成されたコンテンツ:</span>
              <button
                type="button"
                onClick={handleUseContent}
                className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium"
              >
                このコンテンツを使用
              </button>
            </div>
            <div className="bg-[var(--color-bg-primary)] p-3 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] whitespace-pre-wrap max-h-64 overflow-y-auto">
              {generatedContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIContentGenerator;
