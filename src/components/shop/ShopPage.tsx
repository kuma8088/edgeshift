'use client';

import { useEffect, useState } from 'react';
import { getShopProducts, type ShopProduct } from '../../utils/shop-api';
import ProductCard from './ProductCard';

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      const result = await getShopProducts();
      if (result.success && result.data) {
        setProducts(result.data);
      } else {
        setError(result.error || '商品の取得に失敗しました。');
      }
      setIsLoading(false);
    }
    fetchProducts();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
          ショップ
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          テンプレート・コースなど、すぐに使えるデジタルプロダクトを販売しています。
        </p>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse"
            >
              <div className="aspect-video bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="pt-3 border-t border-gray-100">
                  <div className="h-6 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-6 py-4">
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && products.length === 0 && (
        <div className="text-center py-16">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            まだ商品がありません
          </h2>
          <p className="text-gray-600">
            近日中にデジタルプロダクトを公開予定です。お楽しみに！
          </p>
        </div>
      )}

      {/* Product grid */}
      {!isLoading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
