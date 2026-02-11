'use client';

import { useState } from 'react';
import type { Product, CreateProductData } from '../../utils/admin-api';
import { uploadTemplate } from '../../utils/admin-api';
import { RichTextEditor } from './RichTextEditor';

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
  const [slug, setSlug] = useState(product?.slug || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(product?.thumbnail_url || '');
  const [demoUrl, setDemoUrl] = useState(product?.demo_url || '');
  const [features, setFeatures] = useState(product?.features || '');
  const [longDescription, setLongDescription] = useState(product?.long_description || '');
  const [purchaseTagId, setPurchaseTagId] = useState(product?.purchase_tag_id || '');
  const [purchaseSequenceId, setPurchaseSequenceId] = useState(product?.purchase_sequence_id || '');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
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
      slug: slug || undefined,
      thumbnail_url: thumbnailUrl || undefined,
      demo_url: demoUrl || undefined,
      features: features || undefined,
      long_description: longDescription || undefined,
      purchase_tag_id: purchaseTagId || undefined,
      purchase_sequence_id: purchaseSequenceId || undefined,
    };

    if (product) {
      data.is_active = isActive ? 1 : 0;
    }

    await onSubmit(data);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !product) return;

    setUploadingFile(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const result = await uploadTemplate(product.id, file);
      if (result.success && result.data) {
        setUploadSuccess(`アップロード完了: ${result.data.download_key}`);
      } else {
        setUploadError(result.error || 'アップロードに失敗しました');
      }
    } catch {
      setUploadError('アップロード中にエラーが発生しました');
    } finally {
      setUploadingFile(false);
    }
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

      <div className="border-t border-[var(--color-border)] pt-6 mt-6">
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">ショップ設定</h3>

        <div className="space-y-6">
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              URLスラッグ
            </label>
            <input
              type="text"
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="例: typescript-guide"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">ショップページのURL（英数字とハイフン）</p>
            {product && slug && (
              <a
                href={`/shop/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                ショップページを見る
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}
          </div>

          <div>
            <label htmlFor="thumbnail_url" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              サムネイルURL
            </label>
            <input
              type="text"
              id="thumbnail_url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="例: https://..."
            />
          </div>

          <div>
            <label htmlFor="demo_url" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              デモURL
            </label>
            <input
              type="url"
              id="demo_url"
              value={demoUrl}
              onChange={(e) => setDemoUrl(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="例: https://demo.example.com/preview"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">ライブデモのURL</p>
          </div>

          <div>
            <label htmlFor="features" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              特徴・機能
            </label>
            <textarea
              id="features"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="機能や特徴をカンマ区切りで入力"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
              詳細説明
            </label>
            <RichTextEditor
              value={longDescription}
              onChange={setLongDescription}
              placeholder="商品の詳細な説明を入力..."
            />
          </div>

          {product && product.download_key && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                ダウンロードキー
              </label>
              <p className="px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-muted)]">
                {product.download_key}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">R2ストレージのファイルキー（読み取り専用）</p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-6 mt-6">
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">購入後アクション</h3>

        <div className="space-y-6">
          <div>
            <label htmlFor="purchase_tag_id" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              購入後タグ
            </label>
            <input
              type="text"
              id="purchase_tag_id"
              value={purchaseTagId}
              onChange={(e) => setPurchaseTagId(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="タグIDを入力"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">購入完了時に付与するタグのID</p>
          </div>

          <div>
            <label htmlFor="purchase_sequence_id" className="block text-sm font-medium text-[var(--color-text)] mb-2">
              購入後シーケンス
            </label>
            <input
              type="text"
              id="purchase_sequence_id"
              value={purchaseSequenceId}
              onChange={(e) => setPurchaseSequenceId(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="シーケンスIDを入力"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">購入完了時に登録するシーケンスのID</p>
          </div>
        </div>
      </div>

      {product && (
        <div className="border-t border-[var(--color-border)] pt-6 mt-6">
          <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">テンプレートファイル</h3>
          {product.download_key && (
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              現在のファイル: {product.download_key}
            </p>
          )}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploadingFile}
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-[var(--color-accent)] file:text-white hover:file:bg-[var(--color-accent-hover)] disabled:opacity-50"
          />
          {uploadingFile && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">アップロード中...</p>
          )}
          {uploadError && (
            <p className="mt-2 text-sm text-red-500">{uploadError}</p>
          )}
          {uploadSuccess && (
            <p className="mt-2 text-sm text-green-600">{uploadSuccess}</p>
          )}
        </div>
      )}

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
