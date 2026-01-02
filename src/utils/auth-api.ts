/**
 * Phase 6 Auth API utilities
 * Handles Magic Link + TOTP authentication with HTTPOnly cookies
 */

const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';
const PREMIUM_BASE = `${API_BASE}/premium`;

export interface User {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'subscriber';
}

export interface MagicLinkVerifyResponse {
  status: 'totp_setup_required' | 'totp_verify_required';
  temp_token: string;
  qr_code_url?: string;
  secret?: string;
}

export interface AuthSession {
  email: string;
  is_first_time: boolean;
  temp_token: string;
  qr_code_url?: string;
  totp_secret?: string;
}

interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Makes authenticated requests with credentials (cookies)
 */
async function authRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
  } = {}
): Promise<AuthResponse<T>> {
  const { method = 'GET', body } = options;

  try {
    const response = await fetch(`${PREMIUM_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include HTTPOnly cookies
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed: ${response.status}`,
      };
    }

    // Normalize response format: backend returns { success: true, data: { user, ... } }
    // Don't double-wrap if already in standard format
    if (typeof data === 'object' && data !== null && 'success' in data) {
      // Check for error field in 200 response
      if ('error' in data && typeof data.error === 'string') {
        return { success: false, error: data.error };
      }
      // Return normalized: { success: true, data: actualData }
      return { success: data.success, data: data.data };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

/**
 * Request Magic Link to be sent to email
 */
export async function requestMagicLink(email: string): Promise<AuthResponse<{ message: string }>> {
  return authRequest('/auth/request-magic-link', {
    method: 'POST',
    body: { email },
  });
}

/**
 * Verify Magic Link token and get TOTP status
 * Returns temp_token and TOTP setup/verify instructions
 */
export async function verifyMagicLink(token: string): Promise<AuthResponse<MagicLinkVerifyResponse>> {
  try {
    const url = new URL(`${PREMIUM_BASE}/auth/verify`);
    url.searchParams.set('token', token);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed: ${response.status}`,
      };
    }

    // Normalize response format
    if (typeof data === 'object' && data !== null && 'success' in data) {
      if ('error' in data && typeof data.error === 'string') {
        return { success: false, error: data.error };
      }
      return { success: data.success, data: data.data };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

/**
 * Setup TOTP for first-time users
 */
export async function setupTOTP(
  tempToken: string,
  totpCode: string
): Promise<AuthResponse<User>> {
  return authRequest('/auth/totp/setup', {
    method: 'POST',
    body: { temp_token: tempToken, totp_code: totpCode },
  });
}

/**
 * Verify TOTP for returning users
 */
export async function verifyTOTP(
  tempToken: string,
  totpCode: string
): Promise<AuthResponse<User>> {
  return authRequest('/auth/totp/verify', {
    method: 'POST',
    body: { temp_token: tempToken, totp_code: totpCode },
  });
}

/**
 * Get current user session
 * Backend returns { success: true, data: { user, authMethod } }
 * We extract just the user for the frontend
 */
export async function getCurrentUser(): Promise<AuthResponse<User>> {
  const result = await authRequest<{ user: User; authMethod: string }>('/auth/me');

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Extract user from nested response
  if (result.data && 'user' in result.data) {
    return { success: true, data: result.data.user };
  }

  // Fallback: if data is already User object (shouldn't happen but handle gracefully)
  return { success: true, data: result.data as unknown as User };
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<AuthResponse<{ message: string }>> {
  return authRequest('/auth/logout', { method: 'POST' });
}

/**
 * Validate Magic Link token
 * Alias for verifyMagicLink for backward compatibility
 */
export async function validateMagicLink(token: string): Promise<AuthResponse<AuthSession>> {
  try {
    const url = new URL(`${PREMIUM_BASE}/auth/verify`);
    url.searchParams.set('token', token);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const rawData = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: rawData.error || `Request failed: ${response.status}`,
      };
    }

    // Normalize: backend returns { success, data: {...} }
    const data = (typeof rawData === 'object' && rawData !== null && 'data' in rawData)
      ? rawData.data
      : rawData;

    // Transform API response to AuthSession format
    const session: AuthSession = {
      email: data.email || '',
      is_first_time: data.status === 'totp_setup_required',
      temp_token: data.temp_token,
      qr_code_url: data.qr_code_url,
      totp_secret: data.secret,
    };

    return { success: true, data: session };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}
