'use client';

import { useState } from 'react';
import type { CourseWithCounts, CreateCourseData } from '../../utils/admin-api';

interface CourseFormProps {
  course?: CourseWithCounts;
  onSubmit: (data: CreateCourseData & { is_published?: number; sort_order?: number; product_id?: string | null }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CourseForm({ course, onSubmit, onCancel, loading = false }: CourseFormProps) {
  const [title, setTitle] = useState(course?.title || '');
  const [slug, setSlug] = useState(course?.slug || '');
  const [description, setDescription] = useState(course?.description || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(course?.thumbnail_url || '');
  const [productId, setProductId] = useState(course?.product_id || '');
  const [isPublished, setIsPublished] = useState(course?.is_published === 1);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    // Auto-generate slug from title if slug is empty or matches previous auto-generated value
    if (!course) {
      const generated = value
        .toLowerCase()
        .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateCourseData & { is_published?: number; sort_order?: number; product_id?: string | null } = {
      title,
      slug,
      description: description || undefined,
      thumbnail_url: thumbnailUrl || undefined,
      product_id: productId || undefined,
    };

    if (course) {
      data.is_published = isPublished ? 1 : 0;
    }

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          コースタイトル <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: TypeScript実践入門"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          スラッグ <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: typescript-intro"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">URLに使用される識別子（英数字とハイフン）</p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          説明
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="コースの説明を入力"
        />
      </div>

      <div>
        <label htmlFor="thumbnail_url" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          サムネイルURL
        </label>
        <input
          type="url"
          id="thumbnail_url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: https://example.com/images/course-thumb.jpg"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">コース一覧で表示されるサムネイル画像</p>
      </div>

      <div>
        <label htmlFor="product_id" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          商品ID（オプション）
        </label>
        <input
          type="text"
          id="product_id"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: prod_xxxxxxxxxxxx"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">このコースに紐づく商品のID</p>
      </div>

      {course && (
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
          disabled={loading}
          className="flex-1 px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : course ? '更新' : '作成'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
