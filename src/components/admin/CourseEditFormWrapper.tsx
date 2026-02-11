'use client';

import { useState, useEffect } from 'react';
import { getCourse, updateCourse, type CourseWithCounts, type CreateCourseData } from '../../utils/admin-api';
import { CourseForm } from './CourseForm';

export default function CourseEditFormWrapper() {
  const [course, setCourse] = useState<CourseWithCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      setError('Course ID is required');
      setLoading(false);
      return;
    }

    getCourse(id).then((result) => {
      if (result.success && result.data) {
        setCourse(result.data);
      } else {
        setError(result.error || 'Failed to load course');
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (data: CreateCourseData & { is_published?: number; sort_order?: number; product_id?: string | null }) => {
    if (!course) return;

    setSubmitLoading(true);
    setError(null);

    const result = await updateCourse(course.id, data);

    if (result.success) {
      window.location.href = '/admin/courses';
    } else {
      setError(result.error || 'Failed to update course');
      setSubmitLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/courses';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error && !course) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <a
          href="/admin/courses"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          コース一覧に戻る
        </a>
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
      {course && (
        <CourseForm
          course={course}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={submitLoading}
        />
      )}
    </>
  );
}
