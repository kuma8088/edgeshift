'use client';

import { useState, useEffect } from 'react';
import {
  getCurrentUser,
  logout,
  getMyPurchases,
  getMyCourses,
  getDownloadUrl,
  type CurrentUser,
  type MyPurchase,
  type MyCourse,
} from '../../utils/my-api';

export function Dashboard() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [purchases, setPurchases] = useState<MyPurchase[]>([]);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const userResult = await getCurrentUser();
      if (!userResult.success || !userResult.data) {
        window.location.href = '/auth/login';
        return;
      }
      setUser(userResult.data);

      // Load purchases and courses in parallel
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

  const handleLogout = async () => {
    setLoggingOut(true);
    const result = await logout();
    if (result.success) {
      window.location.href = '/auth/login';
    } else {
      setLoggingOut(false);
      alert('ログアウトに失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Card */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-8 border border-[var(--color-border)]">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">マイページ</h1>
        <p className="text-[var(--color-text-secondary)]">
          こんにちは、<span className="font-medium text-[var(--color-text)]">{user.email}</span> さん
        </p>
      </div>

      {/* Courses Section */}
      {courses.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">受講中のコース</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <a
                key={course.id}
                href={`/learn/${course.slug}`}
                className="block bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors overflow-hidden"
              >
                {course.thumbnail_url && (
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-[var(--color-text)] mb-1">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-[var(--color-text-secondary)] mb-2 line-clamp-2">
                      {course.description}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {course.section_count} セクション · {course.lecture_count} レクチャー
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Purchases Section */}
      {purchases.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">購入済みコンテンツ</h2>
          <div className="space-y-3">
            {purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex items-center gap-4 bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]"
              >
                {purchase.product.thumbnail_url && (
                  <img
                    src={purchase.product.thumbnail_url}
                    alt={purchase.product.name}
                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--color-text)] truncate">
                    {purchase.product.name}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {purchase.product.product_type === 'pdf' ? 'PDF' :
                     purchase.product.product_type === 'course' ? 'コース' : 'その他'}
                    {' · '}
                    ¥{purchase.product.price_cents.toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {purchase.product.has_download && (
                    <a
                      href={getDownloadUrl(purchase.product.id)}
                      className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm hover:opacity-90 transition-opacity"
                    >
                      ダウンロード
                    </a>
                  )}
                  {purchase.product.slug && (
                    <a
                      href={`/shop/${purchase.product.slug}`}
                      className="px-4 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text)] rounded-lg text-sm hover:bg-[var(--color-border)] transition-colors border border-[var(--color-border)]"
                    >
                      詳細
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {courses.length === 0 && purchases.length === 0 && (
        <div className="text-center py-12 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <p className="text-[var(--color-text-secondary)] mb-4">
            まだ購入済みのコンテンツはありません
          </p>
          <a
            href="/shop"
            className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            ショップを見る
          </a>
        </div>
      )}

      {/* Logout Button */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="px-6 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--color-border)]"
        >
          {loggingOut ? 'ログアウト中...' : 'ログアウト'}
        </button>
      </div>
    </div>
  );
}
