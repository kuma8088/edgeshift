'use client';

import { useState, useEffect } from 'react';
import type { Product, CreateProductData, Tag, Sequence } from '../../utils/admin-api';
import { uploadTemplate, uploadProductImage, listTags, listSequences } from '../../utils/admin-api';
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [manualStripePrice, setManualStripePrice] = useState(false);
  const [isActive, setIsActive] = useState(product?.is_active !== 0);

  // Tags & Sequences for select dropdowns
  const [tags, setTags] = useState<Tag[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);

  // Features JSON validation
  const [featuresError, setFeaturesError] = useState('');
  const [parsedFeatures, setParsedFeatures] = useState<string[]>([]);

  useEffect(() => {
    listTags().then((res) => {
      if (res.success && res.data?.tags) setTags(res.data.tags);
    });
    listSequences().then((res) => {
      if (res.success && res.data?.sequences) setSequences(res.data.sequences);
    });
  }, []);

  // Validate features JSON
  useEffect(() => {
    if (!features.trim()) {
      setFeaturesError('');
      setParsedFeatures([]);
      return;
    }
    try {
      const parsed = JSON.parse(features);
      if (!Array.isArray(parsed)) {
        setFeaturesError('JSON配列で入力してください（例: ["項目1", "項目2"]）');
        setParsedFeatures([]);
      } else {
        setFeaturesError('');
        setParsedFeatures(parsed.map(String));
      }
    } catch {
      setFeaturesError('無効なJSONです');
      setParsedFeatures([]);
    }
  }, [features]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateProductData & { is_active?: number } = {
      name,
      description: description || undefined,
      price_cents: parseInt(priceCents, 10),
      product_type: productType,
      stripe_price_id: manualStripePrice ? (stripePriceId || undefined) : undefined,
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setImageUploadError('');

    try {
      const result = await uploadProductImage(file);
      if (result.success && result.data) {
        setThumbnailUrl(result.data.url);
      } else {
        setImageUploadError(result.error || 'アップロードに失敗しました');
      }
    } catch {
      setImageUploadError('アップロード中にエラーが発生しました');
    } finally {
      setUploadingImage(false);
    }
  };

  const inputClass = 'w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]';
  const labelClass = 'block text-sm font-medium text-[var(--color-text)] mb-2';
  const fieldsetClass = 'border border-[var(--color-border)] rounded-lg p-6 space-y-6';
  const legendClass = 'text-base font-semibold text-[var(--color-text)] px-2';

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* === Section 1: 基本情報 === */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>基本情報</legend>

        <div>
          <label htmlFor="name" className={labelClass}>
            商品名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
            placeholder="例: TypeScript入門ガイド"
          />
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>説明</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="商品の説明を入力"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="price_cents" className={labelClass}>
              価格 (円) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="price_cents"
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
              required
              min="0"
              className={inputClass}
              placeholder="例: 2980"
            />
          </div>

          <div>
            <label htmlFor="product_type" className={labelClass}>
              商品タイプ <span className="text-red-500">*</span>
            </label>
            <select
              id="product_type"
              value={productType}
              onChange={(e) => setProductType(e.target.value as 'pdf' | 'course' | 'other')}
              className={inputClass}
            >
              <option value="pdf">PDF</option>
              <option value="course">コース</option>
              <option value="other">その他</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="stripe_price_id" className="block text-sm font-medium text-[var(--color-text)]">Stripe Price ID</label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={manualStripePrice}
                onChange={(e) => setManualStripePrice(e.target.checked)}
                className="w-3.5 h-3.5 text-[var(--color-accent)] border-[var(--color-border)] rounded"
              />
              手動で設定
            </label>
          </div>
          {manualStripePrice ? (
            <input
              type="text"
              id="stripe_price_id"
              value={stripePriceId}
              onChange={(e) => setStripePriceId(e.target.value)}
              className={inputClass}
              placeholder="例: price_1234567890"
            />
          ) : (
            <>
              {stripePriceId ? (
                <p className="px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-muted)]">
                  {stripePriceId}
                </p>
              ) : (
                <p className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  保存時に Stripe で自動生成されます
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label htmlFor="slug" className={labelClass}>URLスラッグ</label>
          <input
            type="text"
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={inputClass}
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
      </fieldset>

      {/* === Section 2: 販売設定 === */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>販売設定</legend>

        <div>
          <label htmlFor="thumbnail_url" className={labelClass}>サムネイルURL</label>
          <div className="flex gap-2">
            <input
              type="text"
              id="thumbnail_url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className={`${inputClass} flex-1`}
              placeholder="例: https://..."
            />
            <label className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white ${uploadingImage ? 'bg-gray-400 cursor-not-allowed' : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] cursor-pointer'}`}>
              {uploadingImage ? 'アップロード中...' : '画像アップロード'}
              <input
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageUpload}
                disabled={uploadingImage}
              />
            </label>
          </div>
          {imageUploadError && (
            <p className="mt-2 text-sm text-red-500">{imageUploadError}</p>
          )}
          {thumbnailUrl && (
            <div className="mt-2">
              <img
                src={thumbnailUrl}
                alt="サムネイルプレビュー"
                className="max-w-xs h-auto rounded-lg border border-[var(--color-border)]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="demo_url" className={labelClass}>デモURL</label>
          <input
            type="url"
            id="demo_url"
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            className={inputClass}
            placeholder="例: https://demo.example.com/preview"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">ライブデモのURL</p>
        </div>

        <div>
          <label htmlFor="external_url" className={labelClass}>外部URL</label>
          <input
            type="url"
            id="external_url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            className={inputClass}
            placeholder="例: https://course.example.com/start"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">コースや外部サービスへのリンク</p>
        </div>
      </fieldset>

      {/* === Section 3: DLコンテンツ === */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>DLコンテンツ</legend>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          ファイルをアップロードすると R2 に保存され、購入時にダウンロードリンク付きメールが自動送信されます。
        </div>

        {product && (
          <div>
            <label className={labelClass}>テンプレートファイル</label>
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

        {product && !product.download_key && !uploadSuccess && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ダウンロードキーが未設定です。ファイルをアップロードしないと購入時のDLメールが送信されません。
          </div>
        )}

        {product && product.download_key && (
          <div>
            <label className={labelClass}>ダウンロードキー</label>
            <p className="px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-muted)]">
              {product.download_key}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">R2ストレージのファイルキー（読み取り専用）</p>
          </div>
        )}

        <div>
          <label htmlFor="download_url" className={labelClass}>ダウンロードURL（外部）</label>
          <input
            type="url"
            id="download_url"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className={inputClass}
            placeholder="例: https://example.com/downloads/file.pdf"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">外部URLを直接指定する場合（R2不使用）</p>
        </div>
      </fieldset>

      {/* === Section 4: LP設定 === */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>LP設定</legend>

        <div>
          <label htmlFor="features" className={labelClass}>特徴・機能（JSON配列）</label>
          <textarea
            id="features"
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={3}
            className={`${inputClass} ${featuresError ? 'border-red-300 focus:ring-red-400' : ''}`}
            placeholder='["レスポンシブ対応", "無料プラグインのみ", "日本語対応"]'
          />
          {featuresError && (
            <p className="mt-1 text-sm text-red-500">{featuresError}</p>
          )}
          {parsedFeatures.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {parsedFeatures.map((f, i) => (
                <span key={i} className="inline-flex items-center px-3 py-1 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-sm rounded-full">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>詳細説明</label>
          <RichTextEditor
            value={longDescription}
            onChange={setLongDescription}
            placeholder="商品の詳細な説明を入力..."
          />
        </div>
      </fieldset>

      {/* === Section 5: 自動化設定 === */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>自動化設定</legend>

        <div>
          <label htmlFor="purchase_tag_id" className={labelClass}>購入後タグ</label>
          <select
            id="purchase_tag_id"
            value={purchaseTagId}
            onChange={(e) => setPurchaseTagId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択しない</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">購入完了時に付与するタグ</p>
        </div>

        <div>
          <label htmlFor="purchase_sequence_id" className={labelClass}>購入後シーケンス</label>
          <select
            id="purchase_sequence_id"
            value={purchaseSequenceId}
            onChange={(e) => setPurchaseSequenceId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択しない</option>
            {sequences.map((seq) => (
              <option key={seq.id} value={seq.id}>
                {seq.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">購入完了時に登録するシーケンス</p>
        </div>
      </fieldset>

      {/* === Submit === */}
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
