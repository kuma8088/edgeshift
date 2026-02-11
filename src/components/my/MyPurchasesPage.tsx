'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, getMyPurchases, getDownloadUrl, type MyPurchase } from '../../utils/my-api';

function DownloadButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const url = getDownloadUrl(productId);
      const response = await fetch(url, { method: 'HEAD', credentials: 'include' });
      if (response.status === 401) { setError('ログインが必要です'); return; }
      if (response.status === 403) { setError('アクセス権がありません'); return; }
      if (!response.ok) { setError('ダウンロードに失敗しました'); return; }
      window.open(url, '_blank');
    } catch {
      setError('ネットワークエラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {loading ? 'ダウンロード中...' : 'ダウンロード'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function getProductTypeBadge(type: string): { label: string; color: string } {
  switch (type) {
    case 'course': return { label: 'Course', color: 'bg-purple-100 text-purple-700' };
    case 'pdf': return { label: 'PDF', color: 'bg-blue-100 text-blue-700' };
    default: return { label: type, color: 'bg-gray-100 text-gray-700' };
  }
}

export function MyPurchasesPage() {
  const [purchases, setPurchases] = useState<MyPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const userResult = await getCurrentUser();
      if (!userResult.success || !userResult.data) {
        window.location.href = '/auth/login?redirect=/my/purchases';
        return;
      }

      const result = await getMyPurchases();
      if (result.success && result.data) {
        setPurchases(result.data.purchases);
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
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
              <div className="aspect-video bg-gray-200" />
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
      <h1 className="text-2xl font-bold text-gray-900">購入済みコンテンツ</h1>

      {purchases.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <div className="text-4xl mb-4">📦</div>
          <p className="text-gray-600 text-lg">まだ購入済みのコンテンツはありません</p>
          <p className="text-gray-400 text-sm mt-2 mb-6">ショップでコンテンツを購入すると、ここに表示されます</p>
          <a href="/shop" className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            ショップを見る
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {purchases.map((purchase) => {
            const badge = getProductTypeBadge(purchase.product.product_type);
            return (
              <div key={purchase.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                  {purchase.product.thumbnail_url ? (
                    <img src={purchase.product.thumbnail_url} alt={purchase.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 mb-2">{purchase.product.name}</h3>
                  {purchase.product.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{purchase.product.description}</p>
                  )}
                  <div className="text-xs text-gray-400 mb-4">
                    購入日: {new Date(purchase.purchased_at * 1000).toLocaleDateString('ja-JP')}
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                    {purchase.product.has_download && <DownloadButton productId={purchase.product.id} />}
                    {purchase.product.slug && (
                      <a href={`/shop/${purchase.product.slug}`} className="text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors">
                        詳細を見る &rarr;
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
