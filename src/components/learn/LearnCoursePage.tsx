'use client';

import { useState, useEffect } from 'react';
import { getLearnCourse, type PublishedCourse } from '../../utils/shop-api';
import { CourseAuthGuard } from './CourseAuthGuard';

function getLectureIcon(type: string): string {
  switch (type) {
    case 'video':
      return '\uD83C\uDFAC';
    case 'quiz':
      return '\u2753';
    case 'text':
    default:
      return '\uD83D\uDCDD';
  }
}

export function LearnCoursePage() {
  const [course, setCourse] = useState<PublishedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchCourse = async () => {
      // Extract slug from URL: /learn/xxx
      const pathParts = window.location.pathname.split('/');
      const slug = pathParts[2];

      if (!slug) {
        setError('コースが見つかりません');
        setLoading(false);
        return;
      }

      const result = await getLearnCourse(slug);

      if (!result.success) {
        if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
          setAuthRequired(true);
          setLoading(false);
          return;
        }
        setError(result.error ?? 'コースの取得に失敗しました');
        setLoading(false);
        return;
      }

      const courseData = result.data!;
      setCourse(courseData);

      // Expand all sections by default
      if (courseData.sections) {
        setExpandedSections(new Set(courseData.sections.map((s) => s.id)));
      }

      setLoading(false);
    };

    fetchCourse();
  }, []);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  if (authRequired) {
    return <CourseAuthGuard />;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-3/4 mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <a href="/learn" className="text-sm text-blue-600 hover:text-blue-800 underline">
          コース一覧に戻る
        </a>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  const totalLectures =
    course.sections?.reduce((sum, s) => sum + (s.lectures?.length ?? 0), 0) ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Course Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-56 object-cover"
          />
        ) : (
          <div className="w-full h-56 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-5xl font-bold opacity-50">
              {course.title.charAt(0)}
            </span>
          </div>
        )}

        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{course.title}</h1>

          {course.description && (
            <p className="text-gray-600 mb-4 leading-relaxed">{course.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-400">
            {course.sections && (
              <span>{course.sections.length} セクション</span>
            )}
            {totalLectures > 0 && (
              <span>{totalLectures} レクチャー</span>
            )}
          </div>
        </div>
      </div>

      {/* Course Content / Sections */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">コース内容</h2>

      <div className="space-y-3">
        {course.sections?.map((section) => {
          const isExpanded = expandedSections.has(section.id);

          return (
            <div
              key={section.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{section.title}</span>
                  {section.lectures && (
                    <span className="ml-3 text-xs text-gray-400">
                      {section.lectures.length} レクチャー
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Lectures */}
              {isExpanded && section.lectures && (
                <div className="border-t border-gray-100">
                  {section.lectures.map((lecture, index) => (
                    <a
                      key={lecture.id}
                      href={`/learn/${course.slug}/lectures/${lecture.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-sm flex-shrink-0">
                        {getLectureIcon(lecture.type)}
                      </span>
                      <span className="flex-1 text-sm text-gray-700 group-hover:text-blue-700">
                        {lecture.title}
                      </span>
                      {lecture.duration_minutes && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {lecture.duration_minutes}分
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <a
          href="/learn"
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          &larr; コース一覧に戻る
        </a>
      </div>
    </div>
  );
}
