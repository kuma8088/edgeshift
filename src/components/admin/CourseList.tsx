'use client';

import { useState, useEffect } from 'react';
import { listCourses, deleteCourse, type CourseWithCounts } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

export function CourseList() {
  const [courses, setCourses] = useState<CourseWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    courseId: string;
    courseTitle: string;
  }>({
    isOpen: false,
    courseId: '',
    courseTitle: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCourses = async () => {
    setLoading(true);
    const result = await listCourses();
    if (result.success && result.data) {
      setCourses(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load courses');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleDelete = (course: CourseWithCounts) => {
    setConfirmModal({
      isOpen: true,
      courseId: course.id,
      courseTitle: course.title,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    const { courseId } = confirmModal;

    try {
      const result = await deleteCourse(courseId);

      if (result.success) {
        setConfirmModal({ isOpen: false, courseId: '', courseTitle: '' });
        await fetchCourses();
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelDelete = () => {
    setConfirmModal({ isOpen: false, courseId: '', courseTitle: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchCourses}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)] mb-4">コースがまだありません</p>
        <a
          href="/admin/courses/new"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          新規作成
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {course.thumbnail_url && (
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="w-16 h-10 object-cover rounded"
                    />
                  )}
                  <h3 className="text-lg font-medium text-[var(--color-text)]">
                    {course.title}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      course.is_published
                        ? 'bg-green-500 text-white'
                        : 'bg-[var(--color-text-muted)] text-white'
                    }`}
                  >
                    {course.is_published ? '公開' : '非公開'}
                  </span>
                </div>
                <div className="flex gap-4 text-sm mb-1">
                  <span className="text-[var(--color-text-muted)]">
                    slug: {course.slug}
                  </span>
                </div>
                {course.description && (
                  <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                    {course.description}
                  </p>
                )}
                <div className="flex gap-4 text-sm">
                  <span className="text-[var(--color-text)]">
                    <span className="font-medium">{course.section_count}</span> セクション
                  </span>
                  <span className="text-[var(--color-text)]">
                    <span className="font-medium">{course.lecture_count}</span> レクチャー
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-2">
                  <span>作成: {new Date(course.created_at * 1000).toLocaleString('ja-JP')}</span>
                  <span>更新: {new Date(course.updated_at * 1000).toLocaleString('ja-JP')}</span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <a
                  href={`/admin/courses/edit?id=${course.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  編集
                </a>
                <a
                  href={`/admin/courses/sections?id=${course.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  セクション管理
                </a>
                <button
                  onClick={() => handleDelete(course)}
                  className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="コースを削除"
        message={`「${confirmModal.courseTitle}」を削除してもよろしいですか？関連するセクションとレクチャーもすべて削除されます。この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={actionLoading}
        danger
      />
    </>
  );
}
