'use client';

import { useState, useEffect } from 'react';
import { listProducts, deleteProduct, type Product } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

const productTypeLabels = {
  pdf: 'PDF',
  course: 'コース',
  other: 'その他',
};

function formatPrice(cents: number): string {
  return `\u00a5${cents.toLocaleString()}`;
}

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    productId: string;
    productName: string;
  }>({
    isOpen: false,
    productId: '',
    productName: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    const result = await listProducts();
    if (result.success && result.data) {
      setProducts(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load products');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = (product: Product) => {
    setConfirmModal({
      isOpen: true,
      productId: product.id,
      productName: product.name,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    const { productId } = confirmModal;

    try {
      const result = await deleteProduct(productId);

      if (result.success) {
        setConfirmModal({ isOpen: false, productId: '', productName: '' });
        await fetchProducts();
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelDelete = () => {
    setConfirmModal({ isOpen: false, productId: '', productName: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchProducts}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)] mb-4">商品がまだありません</p>
        <a
          href="/admin/payments/products/new"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          新規作成
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[var(--color-border)] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-[var(--color-text)]">
                    {product.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      product.is_active
                        ? 'bg-green-500 text-white'
                        : 'bg-[var(--color-text-muted)] text-white'
                    }`}
                  >
                    {product.is_active ? '有効' : '無効'}
                  </span>
                  <span className="px-2 py-1 text-xs rounded-full bg-purple-500 text-white">
                    {productTypeLabels[product.product_type]}
                  </span>
                </div>
                {product.description && (
                  <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                    {product.description}
                  </p>
                )}
                <div className="flex gap-4 text-sm">
                  <span className="text-[var(--color-text)]">
                    <span className="font-medium">{formatPrice(product.price_cents)}</span>
                  </span>
                  {product.stripe_price_id && (
                    <span className="text-[var(--color-text-muted)]">
                      Stripe: {product.stripe_price_id}
                    </span>
                  )}
                </div>
                {(product.download_url || product.external_url) && (
                  <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-1">
                    {product.download_url && (
                      <span>ダウンロード: {product.download_url}</span>
                    )}
                    {product.external_url && (
                      <span>外部URL: {product.external_url}</span>
                    )}
                  </div>
                )}
                <div className="flex gap-4 text-xs text-[var(--color-text-muted)] mt-2">
                  <span>作成: {new Date(product.created_at * 1000).toLocaleString('ja-JP')}</span>
                  <span>更新: {new Date(product.updated_at * 1000).toLocaleString('ja-JP')}</span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                {product.slug && (
                  <a
                    href={`/shop/${product.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-sm border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center gap-1"
                    title="ショップページを開く"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    ショップ
                  </a>
                )}
                <a
                  href={`/admin/payments/products/edit?id=${product.id}`}
                  className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  編集
                </a>
                <button
                  onClick={() => handleDelete(product)}
                  className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="商品を削除"
        message={`「${confirmModal.productName}」を削除してもよろしいですか？この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={actionLoading}
        danger
      />
    </>
  );
}
