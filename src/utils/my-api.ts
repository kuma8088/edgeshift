/**
 * API client for subscriber portal (/my/*)
 * Uses session cookie authentication (not API key)
 */

const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body } = options;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include session cookie
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

// User types
export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  totp_enabled: number;
}

/**
 * Get current authenticated user
 * Backend returns { success: true, data: { user, authMethod } }
 * We extract just the user for the frontend
 */
export async function getCurrentUser(): Promise<ApiResponse<CurrentUser>> {
  const result = await apiRequest<{ user: CurrentUser; authMethod: string }>('/premium/auth/me');

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Extract user from nested response (strict validation)
  if (typeof result.data === 'object' && result.data !== null && 'user' in result.data) {
    return { success: true, data: result.data.user };
  }

  // No fallback - if user is missing, return error
  return { success: false, error: 'Invalid response: missing user data' };
}

/**
 * Logout current user
 * Clears session cookie
 */
export async function logout(): Promise<ApiResponse<void>> {
  return apiRequest<void>('/premium/auth/logout', { method: 'POST' });
}

// === My Page types ===

export interface MyPurchase {
  id: string;
  status: string;
  purchased_at: number;
  product: {
    id: string;
    name: string;
    description: string | null;
    product_type: string;
    price_cents: number;
    currency: string;
    slug: string | null;
    thumbnail_url: string | null;
    has_download: boolean;
  };
}

export interface MyCourse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  section_count: number;
  lecture_count: number;
}

/**
 * Get subscriber's completed purchases with product details
 */
export async function getMyPurchases(): Promise<ApiResponse<{ purchases: MyPurchase[] }>> {
  return apiRequest<{ purchases: MyPurchase[] }>('/premium/my/purchases');
}

/**
 * Get subscriber's accessible courses
 */
export async function getMyCourses(): Promise<ApiResponse<{ courses: MyCourse[] }>> {
  return apiRequest<{ courses: MyCourse[] }>('/premium/my/courses');
}

/**
 * Get download URL for a product (uses session cookie auth)
 */
export function getDownloadUrl(productId: string): string {
  const base = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';
  return `${base}/premium/products/${encodeURIComponent(productId)}/download`;
}
