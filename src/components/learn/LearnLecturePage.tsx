'use client';

import { useState, useEffect } from 'react';
import {
  getLearnLecture,
  getLearnCourse,
  type LectureWithContext,
  type PublishedCourse,
} from '../../utils/shop-api';
import { CourseSidebar } from './CourseSidebar';
import { LectureContent } from './LectureContent';
import { CourseAuthGuard } from './CourseAuthGuard';

export function LearnLecturePage() {
  const [lectureCtx, setLectureCtx] = useState<LectureWithContext | null>(null);
  const [course, setCourse] = useState<PublishedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Extract slug and lecture ID from URL: /learn/xxx/lectures/yyy
      const pathParts = window.location.pathname.split('/');
      const slug = pathParts[2];
      const lectureId = pathParts[4];

      if (!slug || !lectureId) {
        setError('レクチャーが見つかりません');
        setLoading(false);
        return;
      }

      // Fetch lecture and course in parallel
      const [lectureResult, courseResult] = await Promise.all([
        getLearnLecture(lectureId),
        getLearnCourse(slug),
      ]);

      // Check for auth errors
      if (!lectureResult.success) {
        if (lectureResult.status === 401) {
          setAuthRequired(true);
          setLoading(false);
          return;
        }
        setError(lectureResult.error ?? 'レクチャーの取得に失敗しました');
        setLoading(false);
        return;
      }

      if (!courseResult.success) {
        if (courseResult.status === 401) {
          setAuthRequired(true);
          setLoading(false);
          return;
        }
        // Course fetch failed but lecture succeeded - continue without sidebar
      }

      setLectureCtx(lectureResult.data!);
      if (courseResult.data) {
        setCourse(courseResult.data);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  if (authRequired) {
    return <CourseAuthGuard />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-65px)]">
        {/* Sidebar skeleton */}
        <div className="hidden lg:block w-72 border-r border-gray-200 bg-white animate-pulse">
          <div className="p-4 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-2/3" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-8 animate-pulse">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="h-3 bg-gray-100 rounded w-1/3" />
            <div className="h-8 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-100 rounded w-full mt-8" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !lectureCtx) {
    const slug = window.location.pathname.split('/')[2];
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-red-600 mb-4">{error ?? 'レクチャーが見つかりません'}</p>
        <a
          href={slug ? `/learn/${slug}` : '/learn'}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          コースに戻る
        </a>
      </div>
    );
  }

  const { lecture, course: lectureCourseMeta, section, prev, next } = lectureCtx;

  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="メニューを開く"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-72 border-r border-gray-200 bg-white
          overflow-y-auto
          transform transition-transform lg:transform-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {course && (
          <CourseSidebar course={course} currentLectureId={lecture.id} />
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 py-8">
          {/* Breadcrumb */}
          <nav className="max-w-3xl mx-auto mb-6">
            <ol className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
              <li>
                <a
                  href={`/learn/${lectureCourseMeta.slug}`}
                  className="hover:text-blue-600 transition-colors"
                >
                  {lectureCourseMeta.title}
                </a>
              </li>
              <li className="text-gray-300">/</li>
              <li className="text-gray-500">{section.title}</li>
              <li className="text-gray-300">/</li>
              <li className="text-gray-600 font-medium">{lecture.title}</li>
            </ol>
          </nav>

          {/* Lecture title */}
          <div className="max-w-3xl mx-auto mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{lecture.title}</h1>
            {lecture.duration_minutes && (
              <span className="text-sm text-gray-400 mt-1 inline-block">
                {lecture.duration_minutes}分
              </span>
            )}
          </div>

          {/* Lecture content */}
          {lecture.content ? (
            <LectureContent content={lecture.content} />
          ) : (
            <div className="max-w-3xl mx-auto text-center py-12">
              <p className="text-gray-400">このレクチャーにはまだコンテンツがありません</p>
            </div>
          )}

          {/* Prev / Next navigation */}
          <div className="max-w-3xl mx-auto mt-12 pt-8 border-t border-gray-200">
            <div className="flex items-center justify-between gap-4">
              {prev ? (
                <a
                  href={`/learn/${lectureCourseMeta.slug}/lectures/${prev.id}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors group"
                >
                  <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <div className="text-left">
                    <div className="text-xs text-gray-400">前のレクチャー</div>
                    <div className="font-medium line-clamp-1">{prev.title}</div>
                  </div>
                </a>
              ) : (
                <div />
              )}

              {next ? (
                <a
                  href={`/learn/${lectureCourseMeta.slug}/lectures/${next.id}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors group text-right"
                >
                  <div>
                    <div className="text-xs text-gray-400">次のレクチャー</div>
                    <div className="font-medium line-clamp-1">{next.title}</div>
                  </div>
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
