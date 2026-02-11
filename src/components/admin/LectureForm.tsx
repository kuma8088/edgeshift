'use client';

import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  getLecture,
  createLecture,
  updateLecture,
  type CourseLecture,
  type CreateLectureData,
} from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';

export default function LectureForm() {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [lecture, setLecture] = useState<CourseLecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [type, setType] = useState('text');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const [showPreview, setShowPreview] = useState(false);

  // Back URL (determined by context)
  const [backUrl, setBackUrl] = useState('/admin/courses');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const secId = params.get('sectionId');

    if (id) {
      // Edit mode
      setMode('edit');
      setLectureId(id);
      getLecture(id).then((result) => {
        if (result.success && result.data) {
          const l = result.data;
          setLecture(l);
          setTitle(l.title);
          setType(l.type);
          setDurationMinutes(l.duration_minutes?.toString() || '');
          setContent(l.content || '');
          setIsPublished(l.is_published === 1);
          setSectionId(l.section_id);
          // We don't know courseId from lecture, but sections page needs course id
          // User will navigate back via the back link in the Astro page
        } else {
          setError(result.error || 'Failed to load lecture');
        }
        setLoading(false);
      });
    } else if (secId) {
      // Create mode
      setMode('create');
      setSectionId(secId);
      setLoading(false);
    } else {
      setError('Lecture ID or Section ID is required');
      setLoading(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitLoading(true);
    setError(null);

    const data: CreateLectureData & { is_published?: number } = {
      title: title.trim(),
      type,
      content: content || undefined,
      duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
    };

    if (mode === 'edit' && lectureId) {
      data.is_published = isPublished ? 1 : 0;
      const result = await updateLecture(lectureId, data);
      if (result.success) {
        window.history.back();
      } else {
        setError(result.error || 'Failed to update lecture');
        setSubmitLoading(false);
      }
    } else if (mode === 'create' && sectionId) {
      const result = await createLecture(sectionId, data);
      if (result.success) {
        window.history.back();
      } else {
        setError(result.error || 'Failed to create lecture');
        setSubmitLoading(false);
      }
    }
  };

  const handleCancel = () => {
    window.history.back();
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error && !lecture && mode === 'edit') {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={handleCancel}
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          戻る
        </button>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            レクチャータイトル <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="例: TypeScriptの型システム入門"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              タイプ
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="text">テキスト</option>
              <option value="video">動画</option>
              <option value="quiz">クイズ</option>
            </select>
          </div>

          <div>
            <label htmlFor="duration_minutes" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              所要時間（分）
            </label>
            <input
              type="number"
              id="duration_minutes"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min="0"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="例: 15"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-[var(--color-text)]">
              コンテンツ
            </label>
            {content && (
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                {showPreview ? '編集に戻る' : 'プレビュー'}
              </button>
            )}
          </div>
          {showPreview ? (
            <div className="border border-[var(--color-border)] rounded-lg p-6 min-h-[16rem] bg-white">
              {/* Content is admin-created via RichTextEditor; DOMPurify sanitizes as defense-in-depth */}
              <div
                className="prose prose-gray max-w-none
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                  prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg
                  prose-img:rounded-lg prose-img:shadow-sm
                  prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:rounded-r-lg prose-blockquote:py-1
                  prose-li:text-gray-700"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
              />
            </div>
          ) : (
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="レクチャーの内容を入力..."
            />
          )}
        </div>

        {mode === 'edit' && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_published"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-[var(--color-accent)]"
            />
            <label htmlFor="is_published" className="text-sm font-medium text-[var(--color-text)]">
              公開
            </label>
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={submitLoading}
            className="flex-1 px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLoading ? '保存中...' : mode === 'edit' ? '更新' : '作成'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitLoading}
            className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
        </div>
      </form>
    </>
  );
}
