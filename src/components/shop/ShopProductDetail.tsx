'use client';

import { useEffect, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { getShopProduct, checkoutProduct, type ShopProduct } from '../../utils/shop-api';
import DownloadSection from './DownloadSection';

function formatPrice(priceCents: number, currency: string): string {
  if (currency === 'jpy' || currency === 'JPY') {
    return `\u00a5${priceCents.toLocaleString()}`;
  }
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
}

function getProductTypeBadge(type: string): { label: string; color: string } {
  switch (type) {
    case 'course':
      return { label: 'Course', color: 'bg-purple-100 text-purple-700' };
    case 'pdf':
      return { label: 'PDF', color: 'bg-blue-100 text-blue-700' };
    default:
      return { label: type, color: 'bg-gray-100 text-gray-700' };
  }
}

function parseFeatures(features: string | null): string[] {
  if (!features) return [];
  try {
    const parsed = JSON.parse(features);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return features.split('\n').filter(Boolean);
  }
  return [];
}


export default function ShopProductDetail() {
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      // Extract slug from pathname: /shop/xxx → xxx
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const slug = pathParts[pathParts.length - 1];

      if (!slug) {
        setError('商品が見つかりません。');
        setIsLoading(false);
        return;
      }

      const result = await getShopProduct(slug);
      if (result.success && result.data) {
        setProduct(result.data);
      } else {
        setError(result.error || '商品の取得に失敗しました。');
      }
      setIsLoading(false);
    }
    fetchProduct();
  }, []);

  // Sanitize long_description HTML with DOMPurify (defense-in-depth)
  const sanitizedDescription = useMemo(() => {
    if (!product?.long_description) return '';
    return DOMPurify.sanitize(product.long_description);
  }, [product?.long_description]);

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-24 mb-8" />
        <div className="grid md:grid-cols-5 gap-8">
          <div className="md:col-span-3">
            <div className="aspect-video bg-gray-200 rounded-xl mb-6" />
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="h-48 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
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
          商品が見つかりません
        </h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <a
          href="/shop"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
        >
          &larr; ショップに戻る
        </a>
      </div>
    );
  }

  if (!product) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setCheckoutLoading(true);
    setCheckoutError(null);

    const origin = window.location.origin;
    const result = await checkoutProduct({
      product_id: product.id,
      email: checkoutEmail,
      success_url: `${origin}/shop/success`,
      cancel_url: window.location.href,
    });

    if (result.success && result.data?.url) {
      window.location.href = result.data.url;
    } else {
      setCheckoutError(result.error || '決済セッションの作成に失敗しました。');
      setCheckoutLoading(false);
    }
  };

  const badge = getProductTypeBadge(product.product_type);
  const featureList = parseFeatures(product.features);
  const slug = product.slug || product.id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <a
          href="/shop"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          ショップに戻る
        </a>
      </nav>

      <div className="grid md:grid-cols-5 gap-8">
        {/* Left column: Content */}
        <div className="md:col-span-3">
          {/* Thumbnail */}
          {product.thumbnail_url ? (
            <img
              src={product.thumbnail_url}
              alt={product.name}
              className="w-full aspect-video object-cover rounded-xl mb-6 shadow-sm"
            />
          ) : (
            <div className="w-full aspect-video bg-gray-100 rounded-xl mb-6 flex items-center justify-center">
              <svg
                className="w-16 h-16 text-gray-300"
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
            </div>
          )}

          {/* Title and badge */}
          <div className="flex items-start gap-3 mb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex-1">
              {product.name}
            </h1>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${badge.color}`}
            >
              {badge.label}
            </span>
          </div>

          {/* Short description */}
          {product.description && (
            <p className="text-gray-600 mb-6 text-lg leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Long description (sanitized HTML from admin-authored content) */}
          {sanitizedDescription && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">商品説明</h2>
              <div
                className="prose prose-gray max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
              />
            </div>
          )}

          {/* Features */}
          {featureList.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">特徴</h2>
              <ul className="space-y-2">
                {featureList.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <svg
                      className="w-5 h-5 text-green-500 mt-0.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column: Purchase sidebar */}
        <div className="md:col-span-2">
          <div className="sticky top-24 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            {/* Price */}
            <div className="mb-6">
              <span className="text-3xl font-bold text-gray-900">
                {product.price_cents === 0
                  ? '無料'
                  : formatPrice(product.price_cents, product.currency)}
              </span>
              {product.price_cents > 0 && (
                <span className="text-sm text-gray-500 ml-1">(税込)</span>
              )}
            </div>

            {/* Purchase button */}
            {product.stripe_price_id && (
              <button
                onClick={() => {
                  setCheckoutError(null);
                  setShowCheckoutModal(true);
                }}
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg mb-4"
              >
                購入する
              </button>
            )}

            {/* Demo link */}
            {product.demo_url && (
              <a
                href={`/shop/${slug}/demo`}
                className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium mb-4"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                Live Demoを見る
              </a>
            )}

            {/* External link */}
            {product.external_url && (
              <a
                href={product.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium mb-4"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                外部サイトで見る
              </a>
            )}

            {/* Download section */}
            {product.download_key && (
              <DownloadSection
                productId={product.id}
                hasDownload={!!product.download_key}
              />
            )}

            {/* Divider + info */}
            <div className="border-t border-gray-100 pt-4 mt-4 space-y-2 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>安全な決済</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>購入後メールでお届け</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout email modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">購入手続き</h3>
            <p className="text-sm text-gray-600 mb-4">
              メールアドレスを入力してください。購入完了後、このアドレスにダウンロードリンクが届きます。
            </p>
            <form onSubmit={handleCheckout}>
              <input
                type="email"
                value={checkoutEmail}
                onChange={(e) => setCheckoutEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                disabled={checkoutLoading}
                autoFocus
              />
              {checkoutError && (
                <p className="text-sm text-red-600 mb-4">{checkoutError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkoutLoading ? '処理中...' : '決済に進む'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  disabled={checkoutLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
