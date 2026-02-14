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
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
            <div className="aspect-video bg-gray-200 rounded-xl" />
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-12 bg-gray-200 rounded w-48 mt-6" />
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

  const openCheckoutModal = () => {
    setCheckoutError(null);
    setShowCheckoutModal(true);
  };

  const badge = getProductTypeBadge(product.product_type);
  const featureList = parseFeatures(product.features);
  const slug = product.slug || product.id;
  const priceDisplay = product.price_cents === 0
    ? '無料'
    : formatPrice(product.price_cents, product.currency);

  return (
    <>
      {/* ============================== */}
      {/* Section 1: Hero               */}
      {/* ============================== */}
      <section className="bg-gradient-to-br from-[var(--color-accent)]/5 via-white to-white">
        <div className="max-w-5xl mx-auto px-4 py-12 md:py-16">
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

          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Left: Thumbnail */}
            <div>
              {product.thumbnail_url ? (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="w-full aspect-video object-cover rounded-xl shadow-lg"
                />
              ) : (
                <div className="w-full aspect-video bg-gray-100 rounded-xl flex items-center justify-center shadow-lg">
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
            </div>

            {/* Right: Title + Description + Price + CTA */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
                  {badge.label}
                </span>
              </div>

              <h1 className="text-2xl md:text-4xl font-bold text-[var(--color-text)] mb-4 leading-tight">
                {product.name}
              </h1>

              {product.description && (
                <p className="text-[var(--color-text-secondary)] mb-6 text-lg leading-relaxed">
                  {product.description}
                </p>
              )}

              <div className="mb-6">
                <span className="text-3xl md:text-4xl font-bold text-[var(--color-text)]">
                  {priceDisplay}
                </span>
                {product.price_cents > 0 && (
                  <span className="text-sm text-[var(--color-text-muted)] ml-2">(税込)</span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {product.stripe_price_id && (
                  <button
                    onClick={openCheckoutModal}
                    className="py-3 px-8 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-semibold text-lg"
                  >
                    購入する
                  </button>
                )}

                {product.demo_url && (
                  <a
                    href={`/shop/${slug}/demo`}
                    className="inline-flex items-center justify-center gap-2 py-3 px-8 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Live Demo を見る
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== */}
      {/* Section 2: Description         */}
      {/* ============================== */}
      {sanitizedDescription && (
        <section className="py-12 md:py-16">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-8 text-center">商品説明</h2>
            {/* Content sanitized via DOMPurify (line 95-96) - safe for rendering */}
            <div
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          </div>
        </section>
      )}

      {/* ============================== */}
      {/* Section 3: Features            */}
      {/* ============================== */}
      {featureList.length > 0 && (
        <section className="py-12 md:py-16 bg-[var(--color-bg-secondary)]">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-8 text-center">特徴</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featureList.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-4 bg-white rounded-lg border border-[var(--color-border)]"
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
                  <span className="text-[var(--color-text)]">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================== */}
      {/* Section 4: Purchase CTA        */}
      {/* ============================== */}
      <section className="py-12 md:py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="mb-6">
            <span className="text-3xl md:text-4xl font-bold text-[var(--color-text)]">
              {priceDisplay}
            </span>
            {product.price_cents > 0 && (
              <span className="text-sm text-[var(--color-text-muted)] ml-2">(税込)</span>
            )}
          </div>

          {product.stripe_price_id && (
            <>
              <button
                onClick={openCheckoutModal}
                className="py-3 px-12 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-semibold text-lg mb-4"
              >
                購入する
              </button>
              <p className="text-sm text-[var(--color-text-muted)] mb-8">
                クーポンコードは Checkout 画面で入力できます
              </p>
            </>
          )}

          {/* Course manual link */}
          {product.course_slug && (
            <div className="mb-6">
              <a
                href={`/learn/${product.course_slug}`}
                className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:underline font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                インストールマニュアルを見る
              </a>
            </div>
          )}

          {/* Download section */}
          {product.download_key && (
            <div className="mb-6">
              <DownloadSection
                productId={product.id}
                hasDownload={!!product.download_key}
              />
            </div>
          )}

          {/* Security badges */}
          <div className="flex items-center justify-center gap-6 text-sm text-[var(--color-text-muted)]">
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
