'use client';

import { useState } from 'react';
import { createCourse, type CreateCourseData } from '../../utils/admin-api';
import { CourseForm } from './CourseForm';

export default function CourseNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CreateCourseData) => {
    setLoading(true);
    setError(null);

    const result = await createCourse(data);

    if (result.success) {
      window.location.href = '/admin/courses';
    } else {
      setError(result.error || 'Failed to create course');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/courses';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <CourseForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
