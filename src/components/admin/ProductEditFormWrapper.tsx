'use client';

import { useState, useEffect } from 'react';
import { updateProduct, type Product, type CreateProductData } from '../../utils/admin-api';
import { ProductForm } from './ProductForm';

// Simple API request for fetching a single product
async function getProduct(id: string): Promise<{ success: boolean; data?: Product; error?: string }> {
  const apiKey = localStorage.getItem('edgeshift_admin_api_key');
  if (!apiKey) {
    return { success: false, error: 'Not authenticated' };
  }

  const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';

  try {
    const response = await fetch(`${API_BASE}/premium/products/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

export default function ProductEditFormWrapper() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      setError('Product ID is required');
      setLoading(false);
      return;
    }

    getProduct(id).then((result) => {
      if (result.success && result.data) {
        setProduct(result.data);
      } else {
        setError(result.error || 'Failed to load product');
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (data: CreateProductData & { is_active?: number }) => {
    if (!product) return;

    setSubmitLoading(true);
    setError(null);

    const result = await updateProduct(product.id, data);

    if (result.success) {
      window.location.href = '/admin/payments/products';
    } else {
      setError(result.error || 'Failed to update product');
      setSubmitLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/payments/products';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <a
          href="/admin/payments/products"
          className="inline-block px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          商品一覧に戻る
        </a>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      {product && (
        <ProductForm
          product={product}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={submitLoading}
        />
      )}
    </>
  );
}
