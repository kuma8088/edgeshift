'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, getMyCourses, type MyCourse } from '../../utils/my-api';

export function MyCoursesPage() {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const userResult = await getCurrentUser();
      if (!userResult.success || !userResult.data) {
        window.location.href = '/auth/login?redirect=/my/courses';
        return;
      }

      const result = await getMyCourses();
      if (result.success && result.data) {
        setCourses(result.data.courses);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
              <div className="w-full h-44 bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">受講中のコース</h1>

      {courses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-gray-600 text-lg">受講可能なコースはまだありません</p>
          <p className="text-gray-400 text-sm mt-2 mb-6">コースを購入すると、ここに表示されます</p>
          <a href="/shop" className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            ショップを見る
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <a
              key={course.id}
              href={`/learn/${course.slug}`}
              className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden"
            >
              {course.thumbnail_url ? (
                <img src={course.thumbnail_url} alt={course.title} className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-white text-4xl font-bold opacity-50">{course.title.charAt(0)}</span>
                </div>
              )}
              <div className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{course.title}</h3>
                {course.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{course.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {course.section_count > 0 && <span>{course.section_count} セクション</span>}
                  {course.lecture_count > 0 && <span>{course.lecture_count} レクチャー</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
