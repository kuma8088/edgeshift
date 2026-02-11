/**
 * API client for shop (/shop/*) and learn (/learn/*) pages
 * Shop endpoints: no auth required (public)
 * Learn endpoints: session cookie authentication
 */

const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// === Types ===

export interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  product_type: 'pdf' | 'course' | 'other';
  stripe_price_id: string | null;
  download_url: string | null;
  external_url: string | null;
  is_active: number;
  slug: string | null;
  thumbnail_url: string | null;
  demo_url: string | null;
  features: string | null;
  download_key: string | null;
  long_description: string | null;
  created_at: number;
  updated_at: number;
}

export interface PublishedCourse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  is_published: number;
  sort_order: number;
  sections?: PublishedSection[];
}

export interface PublishedSection {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lectures?: PublishedLecture[];
}

export interface PublishedLecture {
  id: string;
  title: string;
  type: string;
  duration_minutes: number | null;
  is_published: number;
  sort_order: number;
  content?: string | null;
}

export interface LectureWithContext {
  lecture: PublishedLecture & { content: string | null };
  course: { id: string; title: string; slug: string };
  section: { id: string; title: string };
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

// === Internal helper ===

async function apiRequest<T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body } = options;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include session cookie for learn endpoints
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return { success: true };
    }

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    // Normalize response format
    if (typeof data === 'object' && data !== null && 'success' in data) {
      return data;
    }
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

// === Shop API (no auth) ===

/**
 * Get all active shop products
 */
export async function getShopProducts(): Promise<ApiResponse<ShopProduct[]>> {
  return apiRequest<ShopProduct[]>('/premium/shop/products');
}

/**
 * Get a single shop product by slug
 */
export async function getShopProduct(slug: string): Promise<ApiResponse<ShopProduct>> {
  return apiRequest<ShopProduct>(`/premium/shop/products/${encodeURIComponent(slug)}`);
}

// === Learn API (session cookie required) ===

/**
 * Get all published courses
 */
export async function getLearnCourses(): Promise<ApiResponse<PublishedCourse[]>> {
  return apiRequest<PublishedCourse[]>('/premium/courses/published');
}

/**
 * Get a published course with sections and lectures
 */
export async function getLearnCourse(slug: string): Promise<ApiResponse<PublishedCourse>> {
  return apiRequest<PublishedCourse>(`/premium/courses/published/${encodeURIComponent(slug)}`);
}

/**
 * Get a published lecture with navigation context
 */
export async function getLearnLecture(id: string): Promise<ApiResponse<LectureWithContext>> {
  return apiRequest<LectureWithContext>(`/premium/lectures/published/${encodeURIComponent(id)}`);
}

// === Download API (session cookie required) ===

/**
 * Get the download URL for a product.
 * Use this URL directly (e.g., in an <a> tag or window.open)
 * to trigger a file download with session cookie authentication.
 */
export function getDownloadUrl(productId: string): string {
  return `${API_BASE}/premium/products/${encodeURIComponent(productId)}/download`;
}
