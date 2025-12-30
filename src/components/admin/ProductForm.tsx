'use client';

import { useState } from 'react';
import type { Product, CreateProductData } from '../../utils/admin-api';

interface ProductFormProps {
  product?: Product;
  onSubmit: (data: CreateProductData & { is_active?: number }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ProductForm({ product, onSubmit, onCancel, loading = false }: ProductFormProps) {
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [priceCents, setPriceCents] = useState(product?.price_cents.toString() || '');
  const [productType, setProductType] = useState<'pdf' | 'course' | 'other'>(product?.product_type || 'pdf');
  const [stripePriceId, setStripePriceId] = useState(product?.stripe_price_id || '');
  const [downloadUrl, setDownloadUrl] = useState(product?.download_url || '');
  const [externalUrl, setExternalUrl] = useState(product?.external_url || '');
  const [isActive, setIsActive] = useState(product?.is_active !== 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateProductData & { is_active?: number } = {
      name,
      description: description || undefined,
      price_cents: parseInt(priceCents, 10),
      product_type: productType,
      stripe_price_id: stripePriceId || undefined,
      download_url: downloadUrl || undefined,
      external_url: externalUrl || undefined,
    };

    if (product) {
      data.is_active = isActive ? 1 : 0;
    }

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          商品名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: TypeScript入門ガイド"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          説明
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="商品の説明を入力"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="price_cents" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            価格 (円) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="price_cents"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            required
            min="0"
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="例: 2980"
          />
        </div>

        <div>
          <label htmlFor="product_type" className="block text-sm font-medium text-[var(--color-text)] mb-2">
            商品タイプ <span className="text-red-500">*</span>
          </label>
          <select
            id="product_type"
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'pdf' | 'course' | 'other')}
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="pdf">PDF</option>
            <option value="course">コース</option>
            <option value="other">その他</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="stripe_price_id" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          Stripe Price ID
        </label>
        <input
          type="text"
          id="stripe_price_id"
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: price_1234567890"
        />
      </div>

      <div>
        <label htmlFor="download_url" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          ダウンロードURL
        </label>
        <input
          type="url"
          id="download_url"
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: https://example.com/downloads/file.pdf"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">購入者がダウンロードできるファイルのURL</p>
      </div>

      <div>
        <label htmlFor="external_url" className="block text-sm font-medium text-[var(--color-text)] mb-2">
          外部URL
        </label>
        <input
          type="url"
          id="external_url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          placeholder="例: https://course.example.com/start"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">コースや外部サービスへのリンク</p>
      </div>

      {product && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-border)] rounded focus:ring-[var(--color-accent)]"
          />
          <label htmlFor="is_active" className="text-sm font-medium text-[var(--color-text)]">
            有効
          </label>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : product ? '更新' : '作成'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
