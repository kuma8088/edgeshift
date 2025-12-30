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

export interface AuthSession {
  email: string;
  is_first_time: boolean;
  totp_secret?: string;
  qr_code_url?: string;
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
 * Validate Magic Link token and get session info
 */
export async function validateMagicLink(token: string): Promise<AuthResponse<AuthSession>> {
  return authRequest('/auth/validate-magic-link', {
    method: 'POST',
    body: { token },
  });
}

/**
 * Setup TOTP for first-time users
 */
export async function setupTOTP(
  token: string,
  totpCode: string
): Promise<AuthResponse<{ backupCodes: string[] }>> {
  return authRequest('/auth/totp/setup', {
    method: 'POST',
    body: { token, totpCode },
  });
}

/**
 * Verify TOTP for returning users
 */
export async function verifyTOTP(
  token: string,
  totpCode: string
): Promise<AuthResponse<{ message: string }>> {
  return authRequest('/auth/totp/verify', {
    method: 'POST',
    body: { token, totpCode },
  });
}

/**
 * Get current user session
 */
export async function getCurrentUser(): Promise<AuthResponse<User>> {
  return authRequest('/auth/me');
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<AuthResponse<{ message: string }>> {
  return authRequest('/auth/logout', { method: 'POST' });
}
