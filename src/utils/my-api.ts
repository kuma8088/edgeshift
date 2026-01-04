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

  // Extract user from nested response
  if (result.data && 'user' in result.data) {
    return { success: true, data: result.data.user };
  }

  // Fallback: if data is already User object
  return { success: true, data: result.data as unknown as CurrentUser };
}

/**
 * Logout current user
 * Clears session cookie
 */
export async function logout(): Promise<ApiResponse<void>> {
  return apiRequest<void>('/premium/auth/logout', { method: 'POST' });
}
