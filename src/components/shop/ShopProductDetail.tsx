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

  // Reset checkout loading on bfcache restore (browser back from Stripe)
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false);
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!showCheckoutModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !checkoutLoading) setShowCheckoutModal(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCheckoutModal, checkoutLoading]);

  // Sanitize long_description HTML with DOMPurify (defense-in-depth)
  const sanitizedDescription = useMemo(() => {
    if (!product?.long_description) return '';
    return DOMPurify.sanitize(product.long_description);
  }, [product?.long_description]);

  // Loading state
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="h-6 bg-gray-200 rounded w-32 mb-8" />
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="aspect-[16/10] bg-gray-200 rounded-xl" />
                <div className="h-8 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
              <div className="space-y-4">
                <div className="h-48 bg-gray-200 rounded-xl" />
              </div>
            </div>
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
    if (!product || checkoutLoading) return;

    setCheckoutLoading(true);
    setCheckoutError(null);

    const origin = window.location.origin;
    const result = await checkoutProduct({
      product_id: product.id,
      email: checkoutEmail,
      success_url: `${origin}/shop/success?email=${encodeURIComponent(checkoutEmail)}&product=${encodeURIComponent(product.name)}`,
      cancel_url: window.location.href,
    });

    if (result.success && result.data?.url) {
      window.location.href = result.data.url;
    } else {
      setCheckoutError(result.error || '決済セッションの作成に失敗しました。');
      setCheckoutLoading(false);
    }
  };

  const openCheckoutModal = () => {
    setCheckoutError(null);
    setShowCheckoutModal(true);
  };

  const badge = getProductTypeBadge(product.product_type);
  const featureList = parseFeatures(product.features);
  const priceDisplay = product.price_cents === 0
    ? '無料'
    : formatPrice(product.price_cents, product.currency);

  return (
    <>
      <section className="bg-gradient-to-br from-[var(--color-accent)]/5 via-white to-white">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          {/* Breadcrumb */}
          <nav className="mb-8">
            <a
              href="/shop"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--color-accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              ショップに戻る
            </a>
          </nav>

          {/* 3-column grid: Main (2) + Sidebar (1) */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* ============================== */}
            {/* Main Column (col-span-2)       */}
            {/* ============================== */}
            <div className="lg:col-span-2">
              {/* Live Demo button above image */}
              {product.demo_url && (
                <div className="mb-4">
                  <a
                    href={product.demo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 py-2 px-4 bg-white border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors text-sm font-medium shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Live Demo を見る
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              {/* Main image */}
              {product.thumbnail_url ? (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="w-full aspect-[16/10] object-cover rounded-xl shadow-lg"
                />
              ) : (
                <div className="w-full aspect-[16/10] bg-gray-100 rounded-xl flex items-center justify-center shadow-lg">
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

              {/* Badge + Title */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] leading-tight">
                  {product.name}
                </h1>
              </div>

              {/* Description */}
              {product.description && (
                <p className="mt-4 text-[var(--color-text-secondary)] text-lg leading-relaxed">
                  {product.description}
                </p>
              )}

              {/* Features */}
              {featureList.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">特徴</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {featureList.map((feature, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg"
                      >
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
                        <span className="text-[var(--color-text)] text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Long description (HTML) - sanitized via DOMPurify above */}
              {sanitizedDescription && (
                <div className="mt-8">
                  <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">商品説明</h2>
                  <div
                    className="prose prose-gray max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                </div>
              )}

              {/* Download section */}
              {product.download_key && (
                <div className="mt-8">
                  <DownloadSection
                    productId={product.id}
                    hasDownload={!!product.download_key}
                  />
                </div>
              )}
            </div>

            {/* ============================== */}
            {/* Sidebar (col-span-1, sticky)   */}
            {/* ============================== */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-8">
                <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm p-6">
                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-3xl md:text-4xl font-bold text-[var(--color-text)]">
                      {priceDisplay}
                    </span>
                    {product.price_cents > 0 && (
                      <span className="text-sm text-[var(--color-text-muted)] ml-2">(税込)</span>
                    )}
                  </div>

                  {/* Purchase button */}
                  {product.stripe_price_id && (
                    <div className="mb-4">
                      <button
                        onClick={openCheckoutModal}
                        className="w-full py-3 px-6 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-semibold text-lg"
                      >
                        購入する
                      </button>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">
                        クーポンコードは Checkout 画面で入力できます
                      </p>
                    </div>
                  )}

                  {/* Live Demo link (secondary) */}
                  {product.demo_url && (
                    <a
                      href={product.demo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors font-medium text-sm mb-4"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Live Demo を見る
                    </a>
                  )}

                  {/* Course link */}
                  {product.course_slug && (
                    <a
                      href={`/learn/${product.course_slug}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors font-medium text-sm mb-4"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      マニュアルを見る
                    </a>
                  )}

                  {/* Security badges */}
                  <div className="pt-4 border-t border-[var(--color-border)]">
                    <div className="flex flex-col gap-2 text-xs text-[var(--color-text-muted)]">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>安全な決済</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>購入後メールでお届け</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* Checkout Email Modal           */}
      {/* ============================== */}
      {showCheckoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !checkoutLoading) setShowCheckoutModal(false);
          }}
        >
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
                  className="flex-1 py-2 px-4 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
    </>
  );
}
