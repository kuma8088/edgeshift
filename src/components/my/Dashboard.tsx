'use client';

import { useState, useEffect } from 'react';
import {
  getCurrentUser,
  getMyPurchases,
  getMyCourses,
  type CurrentUser,
  type MyPurchase,
  type MyCourse,
} from '../../utils/my-api';

export function Dashboard() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [purchases, setPurchases] = useState<MyPurchase[]>([]);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const userResult = await getCurrentUser();
      if (!userResult.success || !userResult.data) {
        window.location.href = '/auth/login?redirect=/my';
        return;
      }
      setUser(userResult.data);

      const [purchasesResult, coursesResult] = await Promise.all([
        getMyPurchases(),
        getMyCourses(),
      ]);

      if (purchasesResult.success && purchasesResult.data) {
        setPurchases(purchasesResult.data.purchases);
      }
      if (coursesResult.success && coursesResult.data) {
        setCourses(coursesResult.data.courses);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-500 mt-1">{user.email}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a href="/my/courses" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{courses.length}</p>
              <p className="text-sm text-gray-500">受講中のコース</p>
            </div>
          </div>
        </a>

        <a href="/my/purchases" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{purchases.length}</p>
              <p className="text-sm text-gray-500">購入済みコンテンツ</p>
            </div>
          </div>
        </a>

        <a href="/my/settings" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{user.email}</p>
              <p className="text-sm text-gray-500">アカウント設定</p>
            </div>
          </div>
        </a>
      </div>

      {/* Recent courses */}
      {courses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">受講中のコース</h2>
            <a href="/my/courses" className="text-sm text-blue-600 hover:text-blue-800">すべて見る &rarr;</a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.slice(0, 3).map((course) => (
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
        </div>
      )}

      {/* Empty state */}
      {courses.length === 0 && purchases.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <div className="text-4xl mb-4">📦</div>
          <p className="text-gray-600 text-lg">まだコンテンツがありません</p>
          <p className="text-gray-400 text-sm mt-2 mb-6">ショップでコンテンツを購入すると、ここに表示されます</p>
          <a href="/shop" className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            ショップを見る
          </a>
        </div>
      )}
    </div>
  );
}
