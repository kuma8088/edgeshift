'use client';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    price_cents: number;
    currency: string;
    product_type: string;
    slug: string | null;
    thumbnail_url: string | null;
    features: string | null;
  };
}

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
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
  } catch {
    // Try line-based parsing
    return features.split('\n').filter(Boolean).slice(0, 3);
  }
  return [];
}

export default function ProductCard({ product }: ProductCardProps) {
  const badge = getProductTypeBadge(product.product_type);
  const featureList = parseFeatures(product.features);
  const href = `/shop/${product.slug || product.id}`;

  return (
    <a
      href={href}
      className="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-100 relative overflow-hidden">
        {product.thumbnail_url ? (
          <img
            src={product.thumbnail_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-300"
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
        {/* Badge */}
        <span
          className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-2">
          {product.name}
        </h3>

        {product.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {product.description}
          </p>
        )}

        {featureList.length > 0 && (
          <ul className="mb-4 space-y-1">
            {featureList.map((feature, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                <svg
                  className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0"
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
        )}

        {/* Price */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-xl font-bold text-gray-900">
            {product.price_cents === 0
              ? '無料'
              : formatPrice(product.price_cents, product.currency)}
          </span>
          <span className="text-sm text-blue-600 font-medium group-hover:translate-x-1 transition-transform duration-200">
            詳細を見る &rarr;
          </span>
        </div>
      </div>
    </a>
  );
}
