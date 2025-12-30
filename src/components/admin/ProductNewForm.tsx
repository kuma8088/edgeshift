'use client';

import { useState } from 'react';
import { createProduct, type CreateProductData } from '../../utils/admin-api';
import { ProductForm } from './ProductForm';

export default function ProductNewForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CreateProductData) => {
    setLoading(true);
    setError(null);

    const result = await createProduct(data);

    if (result.success) {
      window.location.href = '/admin/payments/products';
    } else {
      setError(result.error || 'Failed to create product');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    window.location.href = '/admin/payments/products';
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      <ProductForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        loading={loading}
      />
    </>
  );
}
