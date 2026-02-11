'use client';

import { useState, useEffect } from 'react';
import { getLearnCourses, type PublishedCourse } from '../../utils/shop-api';
import { CourseCard } from './CourseCard';

export function LearnCoursesPage() {
  const [courses, setCourses] = useState<PublishedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      const result = await getLearnCourses();

      if (!result.success) {
        // Check for 401 - redirect to login
        if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
          window.location.href = `/auth/login?redirect=${encodeURIComponent('/learn')}`;
          return;
        }
        setError(result.error ?? 'コースの取得に失敗しました');
        setLoading(false);
        return;
      }

      setCourses(result.data ?? []);
      setLoading(false);
    };

    fetchCourses();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
            <div className="w-full h-44 bg-gray-200" />
            <div className="p-5 space-y-3">
              <div className="h-5 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📚</div>
        <p className="text-gray-600 text-lg">受講可能なコースはまだありません</p>
        <p className="text-gray-400 text-sm mt-2">コースが公開されるまでお待ちください</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}
