'use client';

import { useEffect, useState } from 'react';
import { getShopProduct, type ShopProduct } from '../../utils/shop-api';
import DemoViewer from './DemoViewer';

export default function DemoPage() {
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      // Extract slug from pathname: /shop/xxx/demo → xxx
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      // Expected: ['shop', '<slug>', 'demo']
      const slug = pathParts.length >= 2 ? pathParts[1] : null;

      if (!slug) {
        setError('商品が見つかりません。');
        setIsLoading(false);
        return;
      }

      const result = await getShopProduct(slug);
      if (result.success && result.data) {
        if (!result.data.demo_url) {
          setError('この商品にはデモがありません。');
        } else {
          setProduct(result.data);
        }
      } else {
        setError(result.error || '商品の取得に失敗しました。');
      }
      setIsLoading(false);
    }
    fetchProduct();
  }, []);

  // Loading
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-32 mb-6" />
        <div className="h-8 bg-gray-200 rounded w-64 mb-8" />
        <div className="h-10 bg-gray-200 rounded w-80 mb-4" />
        <div className="h-[600px] bg-gray-200 rounded-xl" />
      </div>
    );
  }

  // Error
  if (error || !product) {
    const slug = window.location.pathname.split('/').filter(Boolean)[1];
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
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
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          デモが利用できません
        </h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <a
          href={slug ? `/shop/${slug}` : '/shop'}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
        >
          &larr; 商品ページに戻る
        </a>
      </div>
    );
  }

  const slug = product.slug || product.id;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <a href="/shop" className="hover:text-blue-600 transition-colors">
          ショップ
        </a>
        <span>/</span>
        <a href={`/shop/${slug}`} className="hover:text-blue-600 transition-colors">
          {product.name}
        </a>
        <span>/</span>
        <span className="text-gray-900 font-medium">Live Demo</span>
      </nav>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          {product.name} - Live Demo
        </h1>
        <p className="text-gray-600">
          実際の動作をプレビューできます。デバイスサイズを切り替えてレスポンシブ対応を確認してください。
        </p>
      </div>

      {/* Demo Viewer */}
      <DemoViewer demoUrl={product.demo_url!} />

      {/* Back to product */}
      <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
        <a
          href={`/shop/${slug}`}
          className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          商品ページに戻る
        </a>
        {product.stripe_price_id && (
          <a
            href={`/shop/${slug}`}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            購入する
          </a>
        )}
      </div>
    </div>
  );
}
